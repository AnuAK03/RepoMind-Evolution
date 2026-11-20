import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import type { FileChurnStat, GitCommit, GitHistoryData, GitTimelinePoint } from './types.ts';
import { WORKSPACE_ROOT, ensureWorkspaceRoot } from './scanner.ts';

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 45000;
const MAX_COMMITS = 150;

export function validateHttpsGitUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid repository URL format. Provide a valid https:// Git URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Only https:// Git repository URLs are permitted.');
  }
  if (!parsed.hostname || parsed.hostname === 'localhost' || parsed.hostname.startsWith('127.') || parsed.hostname.startsWith('10.') || parsed.hostname.startsWith('192.168.')) {
    throw new Error('Local or private network Git URLs are blocked.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Embedded credentials in Git URLs are not allowed.');
  }
  return parsed.toString();
}

export async function runGit(args: string[], cwd?: string, timeoutMs = GIT_TIMEOUT_MS): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: 'echo',
    },
  });
  return stdout;
}

export async function cloneGitRepository(url: string, destDir: string): Promise<void> {
  const cleanUrl = validateHttpsGitUrl(url);
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destDir), { recursive: true });

  await runGit([
    'clone',
    '--depth',
    String(MAX_COMMITS),
    '--no-recurse-submodules',
    '--config',
    'core.hooksPath=/dev/null',
    '--config',
    'core.symlinks=false',
    cleanUrl,
    destDir,
  ]);
}

export async function extractGitHistory(repoDir: string): Promise<GitHistoryData> {
  const t0 = performance.now();
  const gitDir = path.join(repoDir, '.git');
  if (!fs.existsSync(gitDir)) {
    return {
      available: false,
      branch: 'none',
      remoteUrl: null,
      totalCommits: 0,
      commits: [],
      fileChurn: [],
      timeline: [],
      extractionMs: 0,
      note: 'No .git metadata present (e.g., ZIP archive upload excludes .git for security).',
    };
  }

  let branch = 'main';
  try {
    branch = (await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoDir)).trim() || 'HEAD';
  } catch {
    branch = 'HEAD';
  }

  let remoteUrl: string | null = null;
  try {
    const remote = (await runGit(['config', '--get', 'remote.origin.url'], repoDir)).trim();
    if (remote) remoteUrl = remote;
  } catch {
    remoteUrl = null;
  }

  const rawLog = await runGit(
    [
      'log',
      `--max-count=${MAX_COMMITS}`,
      '--numstat',
      '--date=iso-strict',
      '--format=__RM_COMMIT__%n%H%x09%h%x09%an%x09%ae%x09%aI%x09%s',
    ],
    repoDir
  );

  const commits: GitCommit[] = [];
  const blocks = rawLog.split('__RM_COMMIT__\n').filter((b) => b.trim().length > 0);

  for (const block of blocks) {
    const lines = block.split('\n');
    const header = lines[0]?.split('\t') || [];
    if (header.length < 6) continue;
    const [sha, shortSha, author, email, date, ...subjectParts] = header;
    const subject = subjectParts.join('\t');

    const files: { path: string; additions: number; deletions: number }[] = [];
    let additions = 0;
    let deletions = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split('\t');
      if (parts.length < 3) continue;
      const add = parts[0] === '-' ? 0 : Number.parseInt(parts[0], 10) || 0;
      const del = parts[1] === '-' ? 0 : Number.parseInt(parts[1], 10) || 0;
      const filePath = parts.slice(2).join('\t').replace(/\\/g, '/');
      additions += add;
      deletions += del;
      files.push({ path: filePath, additions: add, deletions: del });
    }

    commits.push({
      sha,
      shortSha,
      author,
      email,
      date,
      subject,
      files,
      additions,
      deletions,
    });
  }

  // Aggregate per-file churn
  const churnMap = new Map<
    string,
    { commits: number; additions: number; deletions: number; lastModified: string; authors: Set<string> }
  >();
  const dayMap = new Map<string, { commits: number; additions: number; deletions: number }>();

  for (const c of commits) {
    const day = c.date.slice(0, 10);
    const dStat = dayMap.get(day) || { commits: 0, additions: 0, deletions: 0 };
    dStat.commits += 1;
    dStat.additions += c.additions;
    dStat.deletions += c.deletions;
    dayMap.set(day, dStat);

    for (const f of c.files) {
      const existing = churnMap.get(f.path) || {
        commits: 0,
        additions: 0,
        deletions: 0,
        lastModified: c.date,
        authors: new Set<string>(),
      };
      existing.commits += 1;
      existing.additions += f.additions;
      existing.deletions += f.deletions;
      if (c.date > existing.lastModified) existing.lastModified = c.date;
      existing.authors.add(c.author);
      churnMap.set(f.path, existing);
    }
  }

  const fileChurn: FileChurnStat[] = [...churnMap.entries()]
    .map(([filePath, s]) => ({
      path: filePath,
      commits: s.commits,
      additions: s.additions,
      deletions: s.deletions,
      churn: s.additions + s.deletions,
      lastModified: s.lastModified,
      authors: [...s.authors],
    }))
    .sort((a, b) => b.churn - a.churn || b.commits - a.commits);

  const timeline: GitTimelinePoint[] = [...dayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, s]) => ({
      date,
      commits: s.commits,
      additions: s.additions,
      deletions: s.deletions,
    }));

  const extractionMs = Number((performance.now() - t0).toFixed(2));

  return {
    available: true,
    branch,
    remoteUrl,
    totalCommits: commits.length,
    commits,
    fileChurn,
    timeline,
    extractionMs,
  };
}

export async function compareGitCommits(
  repoDir: string,
  baseSha: string,
  headSha: string
): Promise<{
  baseSha: string;
  headSha: string;
  files: { path: string; status: string; additions: number; deletions: number }[];
  diffPreview: string;
}> {
  if (!/^[A-Za-z0-9_.~^-]+$/.test(baseSha) || !/^[A-Za-z0-9_.~^-]+$/.test(headSha)) {
    throw new Error('Invalid Git ref format.');
  }

  const nameStatusRaw = await runGit(['diff', '--name-status', baseSha, headSha], repoDir);
  const numstatRaw = await runGit(['diff', '--numstat', baseSha, headSha], repoDir);
  const diffPreview = (await runGit(['diff', '--unified=2', baseSha, headSha], repoDir)).slice(0, 14000);

  const statusMap = new Map<string, string>();
  for (const line of nameStatusRaw.split('\n')) {
    const [st, p] = line.trim().split(/\t+/);
    if (st && p) statusMap.set(p, st);
  }

  const files: { path: string; status: string; additions: number; deletions: number }[] = [];
  for (const line of numstatRaw.split('\n')) {
    const parts = line.trim().split('\t');
    if (parts.length < 3) continue;
    const additions = parts[0] === '-' ? 0 : Number.parseInt(parts[0], 10) || 0;
    const deletions = parts[1] === '-' ? 0 : Number.parseInt(parts[1], 10) || 0;
    const filePath = parts.slice(2).join('\t');
    files.push({
      path: filePath,
      status: statusMap.get(filePath) || 'M',
      additions,
      deletions,
    });
  }

  return { baseSha, headSha, files, diffPreview };
}

export async function extractRefSnapshot(repoDir: string, ref: string, snapshotDir: string): Promise<void> {
  if (!/^[A-Za-z0-9_.~^-]+$/.test(ref)) {
    throw new Error('Invalid Git reference.');
  }
  fs.rmSync(snapshotDir, { recursive: true, force: true });
  fs.mkdirSync(snapshotDir, { recursive: true });
  const archivePath = path.join(snapshotDir, 'snapshot.tar');
  await runGit(['archive', '--format=tar', '-o', archivePath, ref], repoDir);
  await execFileAsync('tar', ['-xf', archivePath, '-C', snapshotDir], { timeout: 20000 });
  fs.rmSync(archivePath, { force: true });
}

export async function getRawGitCliVerificationStats(repoDir: string): Promise<{
  cliCommitCount: number;
  cliFileOpsCount: number;
  additionsCli: number;
  deletionsCli: number;
}> {
  const countStr = (await runGit(['rev-list', '--count', `--max-count=${MAX_COMMITS}`, 'HEAD'], repoDir)).trim();
  const cliCommitCount = Number.parseInt(countStr, 10) || 0;

  const shortstat = await runGit(
    ['log', `--max-count=${MAX_COMMITS}`, '--shortstat', '--format='],
    repoDir
  );

  let cliFileOpsCount = 0;
  let additionsCli = 0;
  let deletionsCli = 0;

  for (const line of shortstat.split('\n')) {
    const fMatch = line.match(/(\d+)\s+files?\s+changed/);
    const aMatch = line.match(/(\d+)\s+insertions?\(\+\)/);
    const dMatch = line.match(/(\d+)\s+deletions?\(-\)/);
    if (fMatch) cliFileOpsCount += Number.parseInt(fMatch[1], 10);
    if (aMatch) additionsCli += Number.parseInt(aMatch[1], 10);
    if (dMatch) deletionsCli += Number.parseInt(dMatch[1], 10);
  }

  return { cliCommitCount, cliFileOpsCount, additionsCli, deletionsCli };
}

/**
 * Creates a real, multi-commit Git repository on disk modeled after RepoMind's
 * TaskTracker codebase, extended with realistic auth, API, service, debt, and test files
 * so every module works deterministically out of the box without any fake data.
 */
export async function ensureSampleGitRepo(): Promise<string> {
  ensureWorkspaceRoot();
  const sampleDir = path.join(WORKSPACE_ROOT, 'sample-tasktracker-evolution');
  if (fs.existsSync(path.join(sampleDir, '.git'))) {
    return sampleDir;
  }

  fs.rmSync(sampleDir, { recursive: true, force: true });
  fs.mkdirSync(sampleDir, { recursive: true });

  await runGit(['init', '-b', 'main'], sampleDir);
  await runGit(['config', 'core.hooksPath', '/dev/null'], sampleDir);

  const writeFiles = (files: Record<string, string>) => {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(sampleDir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf8');
    }
  };

  const commitAs = async (name: string, email: string, isoDate: string, message: string) => {
    await runGit(['add', '-A'], sampleDir);
    await execFileAsync(
      'git',
      ['commit', '-m', message, '--date', isoDate],
      {
        cwd: sampleDir,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: name,
          GIT_AUTHOR_EMAIL: email,
          GIT_COMMITTER_NAME: name,
          GIT_COMMITTER_EMAIL: email,
          GIT_AUTHOR_DATE: isoDate,
          GIT_COMMITTER_DATE: isoDate,
        },
      }
    );
  };

  // Commit 1: Initial models, storage, utils
  writeFiles({
    'README.md': `# TaskTracker Evolution\n\nA modular task management backend used for RepoMind Evolution analysis.\n`,
    'requirements.txt': `fastapi==0.115.0\npydantic==2.9.0\npytest==8.3.0\n`,
    'tracker/__init__.py': `"""TaskTracker package."""\n`,
    'tracker/models.py': `from dataclasses import dataclass, field\nfrom datetime import datetime\n\n\n@dataclass\nclass User:\n    id: str\n    email: str\n    role: str = "member"\n\n\n@dataclass\nclass Task:\n    id: str\n    title: str\n    owner_id: str\n    priority: str = "medium"\n    completed: bool = False\n    tags: list[str] = field(default_factory=list)\n    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())\n`,
    'tracker/utils.py': `import re\n\n\ndef slugify(text: str) -> str:\n    """Normalize arbitrary text into a URL-safe identifier."""\n    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", text.strip().lower())\n    return cleaned.strip("-")\n\n\ndef normalize_priority(priority: str) -> str:\n    allowed = {"low", "medium", "high", "critical"}\n    val = (priority or "medium").strip().lower()\n    return val if val in allowed else "medium"\n`,
    'tracker/storage.py': `import json\nfrom pathlib import Path\nfrom tracker.models import Task\n\n\nclass TaskStore:\n    """Filesystem JSON persistence for tasks."""\n\n    def __init__(self, file_path: str = "tasks.json"):\n        self.file_path = Path(file_path)\n\n    def load_all(self) -> list[Task]:\n        if not self.file_path.exists():\n            return []\n        raw = json.loads(self.file_path.read_text(encoding="utf-8"))\n        return [Task(**item) for item in raw]\n\n    def save_all(self, tasks: list[Task]) -> None:\n        payload = [task.__dict__ for task in tasks]\n        self.file_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")\n`,
    'tests/test_utils.py': `from tracker.utils import normalize_priority, slugify\n\n\ndef test_slugify():\n    assert slugify("Hello World!") == "hello-world"\n\n\ndef test_normalize_priority():\n    assert normalize_priority("HIGH") == "high"\n    assert normalize_priority("invalid") == "medium"\n`,
  });
  await commitAs('Anu K.', 'anu@repomind.dev', '2026-10-02T10:15:00Z', 'feat: initialize core models, storage, and utility helpers');

  // Commit 2: Authentication module & tests
  writeFiles({
    'tracker/authentication.py': `import hashlib\nimport hmac\nfrom tracker.models import User\n\n\nTOKEN_SECRET = "dev-placeholder-secret"\n\n\ndef hash_password(password: str, salt: str = "static-salt") -> str:\n    """Compute SHA-256 salted digest for user password verification."""\n    return hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()\n\n\ndef verify_token(token: str, expected_user: User) -> bool:\n    if not token or ":" not in token:\n        return False\n    user_id, sig = token.split(":", 1)\n    if user_id != expected_user.id:\n        return False\n    expected_sig = hmac.new(TOKEN_SECRET.encode("utf-8"), user_id.encode("utf-8"), hashlib.sha256).hexdigest()[:16]\n    return hmac.compare_digest(sig, expected_sig)\n\n\ndef issue_session_token(user: User) -> str:\n    sig = hmac.new(TOKEN_SECRET.encode("utf-8"), user.id.encode("utf-8"), hashlib.sha256).hexdigest()[:16]\n    return f"{user.id}:{sig}"\n`,
    'tests/test_authentication.py': `from tracker.authentication import hash_password, issue_session_token, verify_token\nfrom tracker.models import User\n\n\ndef test_token_roundtrip():\n    user = User(id="u-1", email="ada@example.com")\n    token = issue_session_token(user)\n    assert verify_token(token, user) is True\n\n\ndef test_password_hash_deterministic():\n    assert hash_password("pass123") == hash_password("pass123")\n`,
  });
  await commitAs('Riya Sharma', 'riya@repomind.dev', '2026-10-10T14:20:00Z', 'feat: add session authentication module and token tests');

  // Commit 3: Service layer & API endpoints
  writeFiles({
    'tracker/service.py': `from tracker.authentication import verify_token\nfrom tracker.models import Task, User\nfrom tracker.storage import TaskStore\nfrom tracker.utils import normalize_priority, slugify\n\n\nclass TaskService:\n    """Business workflows for creating, prioritizing, and filtering tasks."""\n\n    def __init__(self, store: TaskStore):\n        self.store = store\n\n    def create_task(self, user: User, token: str, title: str, priority: str = "medium") -> Task:\n        if not verify_token(token, user):\n            raise PermissionError("Invalid authentication token")\n        tasks = self.store.load_all()\n        task = Task(\n            id=slugify(title) or f"task-{len(tasks) + 1}",\n            title=title.strip(),\n            owner_id=user.id,\n            priority=normalize_priority(priority),\n        )\n        tasks.append(task)\n        self.store.save_all(tasks)\n        return task\n\n    def list_tasks(self, owner_id: str | None = None, only_open: bool = False) -> list[Task]:\n        tasks = self.store.load_all()\n        if owner_id:\n            tasks = [t for t in tasks if t.owner_id == owner_id]\n        if only_open:\n            tasks = [t for t in tasks if not t.completed]\n        return tasks\n`,
    'tracker/api.py': `from fastapi import FastAPI, HTTPException\nfrom tracker.models import User\nfrom tracker.service import TaskService\nfrom tracker.storage import TaskStore\n\napp = FastAPI(title="TaskTracker API")\n_store = TaskStore()\n_service = TaskService(_store)\n\n\n@app.get("/health")\ndef health_check():\n    return {"status": "ok"}\n\n\n@app.get("/tasks")\ndef get_tasks(owner_id: str | None = None, only_open: bool = False):\n    return _service.list_tasks(owner_id=owner_id, only_open=only_open)\n\n\n@app.post("/tasks")\ndef post_task(user_id: str, email: str, token: str, title: str, priority: str = "medium"):\n    user = User(id=user_id, email=email)\n    try:\n        return _service.create_task(user, token, title, priority)\n    except PermissionError as exc:\n        raise HTTPException(status_code=403, detail=str(exc))\n`,
    'tests/test_service.py': `from tracker.authentication import issue_session_token\nfrom tracker.models import User\nfrom tracker.service import TaskService\nfrom tracker.storage import TaskStore\n\n\ndef test_create_and_list_task(tmp_path):\n    store = TaskStore(str(tmp_path / "tasks.json"))\n    service = TaskService(store)\n    user = User(id="u-42", email="dev@example.com")\n    token = issue_session_token(user)\n    created = service.create_task(user, token, "Ship release", "high")\n    assert created.priority == "high"\n    assert len(service.list_tasks(owner_id="u-42")) == 1\n`,
  });
  await commitAs('Anu K.', 'anu@repomind.dev', '2026-10-18T11:05:00Z', 'feat: add TaskService workflow and FastAPI endpoints');

  // Commit 4: Notification & analytics reporting module (untested + introduces coupling & complexity)
  writeFiles({
    'tracker/notifications.py': `from tracker.models import Task, User\nfrom tracker.authentication import verify_token\n\n\ndef format_digest(user: User, tasks: list[Task], include_completed: bool = False, urgent_only: bool = False) -> list[str]:\n    messages: list[str] = []\n    for task in tasks:\n        if not include_completed and task.completed:\n            continue\n        if urgent_only and task.priority not in ("high", "critical"):\n            continue\n        if task.priority == "critical":\n            messages.append(f"[CRITICAL] {user.email}: {task.title}")\n        elif task.priority == "high":\n            messages.append(f"[HIGH] {user.email}: {task.title}")\n        else:\n            messages.append(f"[NORMAL] {user.email}: {task.title}")\n    return messages\n\n\ndef dispatch_digest(user: User, token: str, tasks: list[Task], dry_run: bool = True) -> dict:\n    if not verify_token(token, user):\n        return {"sent": 0, "error": "unauthorized"}\n    lines = format_digest(user, tasks)\n    return {"sent": len(lines), "dry_run": dry_run, "preview": lines[:5]}\n`,
    'tracker/reporting.py': `import sqlite3\nfrom tracker.models import Task\nfrom tracker.service import TaskService\n\n\ndef evaluate_backlog_risk(tasks: list[Task], strict: bool = False) -> dict:\n    score = 0\n    critical_count = 0\n    high_count = 0\n    stale_count = 0\n    for task in tasks:\n        if task.completed:\n            continue\n        if task.priority == "critical":\n            critical_count += 1\n            score += 25 if strict else 15\n        elif task.priority == "high":\n            high_count += 1\n            score += 12 if strict else 8\n        else:\n            score += 2\n        if not task.tags:\n            stale_count += 1\n            if strict:\n                score += 4\n    if critical_count > 3 and high_count > 5:\n        tier = "critical"\n    elif score > 60:\n        tier = "high"\n    elif score > 25:\n        tier = "medium"\n    else:\n        tier = "low"\n    return {"score": score, "tier": tier, "critical": critical_count, "high": high_count, "untagged": stale_count}\n\n\ndef export_audit_query(conn: sqlite3.Connection, owner_filter: str) -> list:\n    cursor = conn.cursor()\n    try:\n        return cursor.execute(f"SELECT id, title FROM tasks WHERE owner_id = '{owner_filter}'").fetchall()\n    except:\n        return []\n`,
  });
  await commitAs('Marcus Vance', 'marcus@repomind.dev', '2026-10-29T16:40:00Z', 'feat: add notifications and backlog reporting modules');

  // Commit 5: High-churn authentication update + role validation + API integration
  writeFiles({
    'tracker/authentication.py': `import hashlib\nimport hmac\nfrom tracker.models import User\n\n\nTOKEN_SECRET = "dev-placeholder-secret"\nROLE_WEIGHTS = {"viewer": 1, "member": 2, "maintainer": 3, "admin": 4}\n\n\ndef hash_password(password: str, salt: str = "static-salt") -> str:\n    """Compute salted digest for credential verification."""\n    if not password:\n        raise ValueError("Password cannot be empty")\n    return hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()\n\n\ndef verify_token(token: str, expected_user: User, required_role: str = "member") -> bool:\n    if not token or ":" not in token:\n        return False\n    parts = token.split(":")\n    if len(parts) < 2:\n        return False\n    user_id, sig = parts[0], parts[1]\n    if user_id != expected_user.id:\n        return False\n    if ROLE_WEIGHTS.get(expected_user.role, 0) < ROLE_WEIGHTS.get(required_role, 1):\n        return False\n    expected_sig = hmac.new(TOKEN_SECRET.encode("utf-8"), user_id.encode("utf-8"), hashlib.sha256).hexdigest()[:16]\n    return hmac.compare_digest(sig, expected_sig)\n\n\ndef issue_session_token(user: User) -> str:\n    sig = hmac.new(TOKEN_SECRET.encode("utf-8"), user.id.encode("utf-8"), hashlib.sha256).hexdigest()[:16]\n    return f"{user.id}:{sig}"\n`,
    'tracker/api.py': `from fastapi import FastAPI, HTTPException\nfrom tracker.authentication import verify_token\nfrom tracker.models import User\nfrom tracker.notifications import dispatch_digest\nfrom tracker.reporting import evaluate_backlog_risk\nfrom tracker.service import TaskService\nfrom tracker.storage import TaskStore\n\napp = FastAPI(title="TaskTracker API")\n_store = TaskStore()\n_service = TaskService(_store)\n\n\n@app.get("/health")\ndef health_check():\n    return {"status": "ok"}\n\n\n@app.get("/tasks")\ndef get_tasks(owner_id: str | None = None, only_open: bool = False):\n    return _service.list_tasks(owner_id=owner_id, only_open=only_open)\n\n\n@app.post("/tasks")\ndef post_task(user_id: str, email: str, token: str, title: str, priority: str = "medium"):\n    user = User(id=user_id, email=email)\n    try:\n        return _service.create_task(user, token, title, priority)\n    except PermissionError as exc:\n        raise HTTPException(status_code=403, detail=str(exc))\n\n\n@app.get("/reports/risk")\ndef get_backlog_risk(user_id: str, email: str, token: str, strict: bool = False):\n    user = User(id=user_id, email=email, role="maintainer")\n    if not verify_token(token, user, required_role="maintainer"):\n        raise HTTPException(status_code=403, detail="Maintainer access required")\n    tasks = _service.list_tasks()\n    return evaluate_backlog_risk(tasks, strict=strict)\n\n\n@app.post("/notifications/digest")\ndef send_digest(user_id: str, email: str, token: str):\n    user = User(id=user_id, email=email)\n    tasks = _service.list_tasks(owner_id=user_id, only_open=True)\n    return dispatch_digest(user, token, tasks)\n`,
  });
  await commitAs('Riya Sharma', 'riya@repomind.dev', '2026-11-08T09:30:00Z', 'feat(auth): enforce role weights in verify_token and wire report/digest routes');

  // Commit 6: Service escalation workflow + duplicate helper logic
  writeFiles({
    'tracker/service.py': `from tracker.authentication import verify_token\nfrom tracker.models import Task, User\nfrom tracker.notifications import format_digest\nfrom tracker.storage import TaskStore\nfrom tracker.utils import normalize_priority, slugify\n\n\nclass TaskService:\n    """Business workflows for creating, prioritizing, escalating, and filtering tasks."""\n\n    def __init__(self, store: TaskStore):\n        self.store = store\n\n    def create_task(self, user: User, token: str, title: str, priority: str = "medium") -> Task:\n        if not verify_token(token, user):\n            raise PermissionError("Invalid authentication token")\n        tasks = self.store.load_all()\n        task = Task(\n            id=slugify(title) or f"task-{len(tasks) + 1}",\n            title=title.strip(),\n            owner_id=user.id,\n            priority=normalize_priority(priority),\n        )\n        tasks.append(task)\n        self.store.save_all(tasks)\n        return task\n\n    def escalate_overdue(self, user: User, token: str, target_priority: str = "high") -> list[Task]:\n        if not verify_token(token, user, required_role="maintainer"):\n            raise PermissionError("Maintainer permission required")\n        tasks = self.store.load_all()\n        updated: list[Task] = []\n        for task in tasks:\n            if not task.completed and task.priority == "medium":\n                task.priority = normalize_priority(target_priority)\n                updated.append(task)\n        if updated:\n            self.store.save_all(tasks)\n        return updated\n\n    def list_tasks(self, owner_id: str | None = None, only_open: bool = False) -> list[Task]:\n        tasks = self.store.load_all()\n        if owner_id:\n            tasks = [t for t in tasks if t.owner_id == owner_id]\n        if only_open:\n            tasks = [t for t in tasks if not t.completed]\n        return tasks\n\n    def preview_user_alerts(self, user: User) -> list[str]:\n        return format_digest(user, self.list_tasks(owner_id=user.id, only_open=True))\n`,
    'tests/test_authentication.py': `from tracker.authentication import hash_password, issue_session_token, verify_token\nfrom tracker.models import User\n\n\ndef test_token_roundtrip():\n    user = User(id="u-1", email="ada@example.com")\n    token = issue_session_token(user)\n    assert verify_token(token, user) is True\n\n\ndef test_role_enforcement():\n    member = User(id="u-2", email="bob@example.com", role="member")\n    token = issue_session_token(member)\n    assert verify_token(token, member, required_role="admin") is False\n\n\ndef test_password_hash_deterministic():\n    assert hash_password("pass123") == hash_password("pass123")\n`,
  });
  await commitAs('Anu K.', 'anu@repomind.dev', '2026-11-16T15:10:00Z', 'feat(service): add maintainer task escalation and alert preview');

  return sampleDir;
}
