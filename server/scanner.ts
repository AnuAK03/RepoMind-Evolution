import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import type {
  ArchEdge,
  ArchNode,
  DependencyGraph,
  FileRecord,
  LangStat,
  ManifestInfo,
  SymbolInfo,
  TreeNode,
} from './types.ts';

export const WORKSPACE_ROOT = '/tmp/repomind-evolution-workspaces';
export const MAX_FILES = 1500;
export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_ZIP_BYTES = 45 * 1024 * 1024;

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  'env',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'coverage',
  '.idea',
  '.vscode',
  'target',
  'vendor',
]);

const EXT_LANG: Record<string, string> = {
  '.py': 'Python',
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.cs': 'C#',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.c': 'C',
  '.h': 'C/C++',
  '.css': 'CSS',
  '.scss': 'CSS',
  '.html': 'HTML',
  '.json': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.toml': 'TOML',
  '.md': 'Markdown',
  '.sql': 'SQL',
  '.sh': 'Shell',
};

const CODE_LANGS = new Set([
  'Python',
  'TypeScript',
  'JavaScript',
  'Go',
  'Rust',
  'Java',
  'Kotlin',
  'Ruby',
  'PHP',
  'C#',
  'C++',
  'C',
]);

export function ensureWorkspaceRoot() {
  fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
}

export function isTestPath(relPath: string): boolean {
  const lower = relPath.toLowerCase();
  const base = path.posix.basename(lower);
  return (
    lower.includes('/tests/') ||
    lower.includes('/test/') ||
    lower.includes('/__tests__/') ||
    lower.startsWith('tests/') ||
    lower.startsWith('test/') ||
    base.startsWith('test_') ||
    base.endsWith('_test.py') ||
    base.endsWith('_test.go') ||
    base.includes('.test.') ||
    base.includes('.spec.')
  );
}

export function safeExtractZip(zipBuffer: Buffer, destDir: string): { extractedFiles: number } {
  if (zipBuffer.length > MAX_ZIP_BYTES) {
    throw new Error(`ZIP archive exceeds ${Math.round(MAX_ZIP_BYTES / (1024 * 1024))} MB limit.`);
  }
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  if (entries.length === 0) {
    throw new Error('ZIP archive is empty.');
  }

  fs.mkdirSync(destDir, { recursive: true });
  const resolvedDest = path.resolve(destDir);

  let extractedFiles = 0;
  let totalUncompressed = 0;

  for (const entry of entries) {
    const rawName = entry.entryName.replace(/\\/g, '/');
    if (!rawName || rawName.includes('\0')) continue;

    const segments = rawName.split('/').filter(Boolean);
    if (segments.some((s) => s === '..' || s === '.git')) {
      continue;
    }
    if (segments.some((s) => IGNORED_DIRS.has(s))) {
      continue;
    }
    if (entry.isDirectory) continue;

    // Reject symlinks based on Unix external file attributes
    const unixMode = (entry.header.attr >>> 16) & 0o170000;
    if (unixMode === 0o120000) {
      continue;
    }

    const size = entry.header.size || 0;
    totalUncompressed += size;
    if (totalUncompressed > 120 * 1024 * 1024) {
      throw new Error('Uncompressed archive size exceeds 120 MB safety limit.');
    }

    const targetPath = path.resolve(resolvedDest, ...segments);
    if (!targetPath.startsWith(resolvedDest + path.sep)) {
      throw new Error(`Unsafe archive path detected: ${rawName}`);
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, entry.getData());
    extractedFiles++;
    if (extractedFiles >= MAX_FILES) break;
  }

  // If archive wrapped everything inside a single top-level directory, keep structure clean
  const topEntries = fs.readdirSync(resolvedDest);
  if (topEntries.length === 1) {
    const onlyPath = path.join(resolvedDest, topEntries[0]);
    if (fs.statSync(onlyPath).isDirectory()) {
      const inner = fs.readdirSync(onlyPath);
      for (const item of inner) {
        fs.renameSync(path.join(onlyPath, item), path.join(resolvedDest, item));
      }
      fs.rmdirSync(onlyPath);
    }
  }

  return { extractedFiles };
}

function walkFiles(rootDir: string): string[] {
  const results: string[] = [];
  const resolvedRoot = path.resolve(rootDir);

  function recurse(currentDir: string) {
    if (results.length >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (results.length >= MAX_FILES) return;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        recurse(path.join(currentDir, entry.name));
      } else if (entry.isFile()) {
        const full = path.join(currentDir, entry.name);
        const rel = path.relative(resolvedRoot, full).replace(/\\/g, '/');
        results.push(rel);
      }
    }
  }

  recurse(resolvedRoot);
  return results;
}

function estimateComplexity(blockText: string, language: string): number {
  let score = 1;
  const lines = blockText.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('*')) continue;
    if (language === 'Python') {
      const matches = line.match(/\b(if|elif|for|while|except|with|and|or)\b/g);
      if (matches) score += matches.length;
    } else {
      const matches = line.match(/\b(if|else\s+if|for|while|case|catch)\b/g);
      if (matches) score += matches.length;
      const ops = line.match(/(&&|\|\||\?[^.])/g);
      if (ops) score += ops.length;
    }
  }
  return score;
}

function findBlockEnd(lines: string[], startIdx: number, language: string): number {
  if (language === 'Python') {
    const defLine = lines[startIdx] ?? '';
    const baseIndent = defLine.search(/\S/);
    for (let i = startIdx + 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const indent = lines[i].search(/\S/);
      if (indent <= baseIndent) return i;
    }
    return lines.length;
  }

  let depth = 0;
  let seenBrace = false;
  for (let i = startIdx; i < Math.min(lines.length, startIdx + 400); i++) {
    for (const ch of lines[i]) {
      if (ch === '{') {
        depth++;
        seenBrace = true;
      } else if (ch === '}') {
        depth--;
        if (seenBrace && depth <= 0) {
          return i + 1;
        }
      }
    }
  }
  return Math.min(lines.length, startIdx + 20);
}

function parseSymbolsAndImports(
  relPath: string,
  language: string,
  content: string
): {
  symbols: SymbolInfo[];
  endpoints: { method: string; route: string; line: number }[];
  rawImports: string[];
} {
  const lines = content.split('\n');
  const symbols: SymbolInfo[] = [];
  const endpoints: { method: string; route: string; line: number }[] = [];
  const rawImports: string[] = [];

  if (language === 'Python') {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      const impMatch = trimmed.match(/^(?:from\s+([A-Za-z0-9_.]+)\s+import|import\s+([A-Za-z0-9_.,\s]+))/);
      if (impMatch) {
        if (impMatch[1]) rawImports.push(impMatch[1]);
        else if (impMatch[2]) {
          for (const part of impMatch[2].split(',')) {
            const mod = part.trim().split(/\s+as\s+/)[0]?.trim();
            if (mod) rawImports.push(mod);
          }
        }
      }

      const routeMatch = trimmed.match(/^@(?:app|router)\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/i);
      if (routeMatch) {
        endpoints.push({
          method: routeMatch[1].toUpperCase(),
          route: routeMatch[2],
          line: i + 1,
        });
      }

      const fnMatch = line.match(/^(\s*)(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(/);
      if (fnMatch) {
        const endLine = findBlockEnd(lines, i, 'Python');
        const block = lines.slice(i, endLine).join('\n');
        const nextLine = (lines[i + 1] ?? '').trim();
        const hasDoc = nextLine.startsWith('"""') || nextLine.startsWith("'''");
        symbols.push({
          name: fnMatch[2],
          kind: fnMatch[1].length > 0 ? 'method' : 'function',
          line: i + 1,
          endLine,
          lines: Math.max(1, endLine - i),
          complexity: estimateComplexity(block, 'Python'),
          hasDoc,
          exported: !fnMatch[2].startsWith('_'),
        });
      }

      const clsMatch = line.match(/^(\s*)class\s+([A-Za-z0-9_]+)/);
      if (clsMatch) {
        const endLine = findBlockEnd(lines, i, 'Python');
        const nextLine = (lines[i + 1] ?? '').trim();
        const hasDoc = nextLine.startsWith('"""') || nextLine.startsWith("'''");
        symbols.push({
          name: clsMatch[2],
          kind: 'class',
          line: i + 1,
          endLine,
          lines: Math.max(1, endLine - i),
          complexity: 1,
          hasDoc,
          exported: !clsMatch[2].startsWith('_'),
        });
      }
    }
  } else if (language === 'TypeScript' || language === 'JavaScript') {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      const esmMatch = trimmed.match(/^(?:import|export)\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/);
      if (esmMatch) rawImports.push(esmMatch[1]);
      const reqMatch = trimmed.match(/require\(\s*['"]([^'"]+)['"]\s*\)/);
      if (reqMatch) rawImports.push(reqMatch[1]);

      const routeMatch = trimmed.match(/(?:app|router)\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/i);
      if (routeMatch) {
        endpoints.push({
          method: routeMatch[1].toUpperCase(),
          route: routeMatch[2],
          line: i + 1,
        });
      }

      const prevTrimmed = (lines[i - 1] ?? '').trim();
      const hasDoc = prevTrimmed.endsWith('*/') || prevTrimmed.startsWith('//');

      const fnMatch = trimmed.match(
        /^(export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(|^(export\s+)?(?:const|let)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>/
      );
      if (fnMatch) {
        const name = fnMatch[2] || fnMatch[4];
        if (name) {
          const endLine = findBlockEnd(lines, i, language);
          const block = lines.slice(i, endLine).join('\n');
          symbols.push({
            name,
            kind: 'function',
            line: i + 1,
            endLine,
            lines: Math.max(1, endLine - i),
            complexity: estimateComplexity(block, language),
            hasDoc,
            exported: Boolean(fnMatch[1] || fnMatch[3]),
          });
        }
      }

      const clsMatch = trimmed.match(/^(export\s+)?class\s+([A-Za-z0-9_$]+)/);
      if (clsMatch) {
        const endLine = findBlockEnd(lines, i, language);
        symbols.push({
          name: clsMatch[2],
          kind: 'class',
          line: i + 1,
          endLine,
          lines: Math.max(1, endLine - i),
          complexity: 1,
          hasDoc,
          exported: Boolean(clsMatch[1]),
        });
      }
    }
  } else if (language === 'Go') {
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const imp = trimmed.match(/^"([^"]+)"$|^import\s+"([^"]+)"$/);
      if (imp) rawImports.push(imp[1] || imp[2]);
      const fn = trimmed.match(/^func\s+(?:\([^)]+\)\s*)?([A-Za-z0-9_]+)\s*\(/);
      if (fn) {
        const endLine = findBlockEnd(lines, i, 'Go');
        const block = lines.slice(i, endLine).join('\n');
        symbols.push({
          name: fn[1],
          kind: 'function',
          line: i + 1,
          endLine,
          lines: Math.max(1, endLine - i),
          complexity: estimateComplexity(block, 'Go'),
          hasDoc: (lines[i - 1] ?? '').trim().startsWith('//'),
          exported: /^[A-Z]/.test(fn[1]),
        });
      }
    }
  }

  return { symbols, endpoints, rawImports };
}

function resolveImportTarget(
  sourcePath: string,
  rawImport: string,
  allPaths: Set<string>,
  language: string
): string | null {
  if (!rawImport) return null;

  // Relative JS/TS import
  if (rawImport.startsWith('.')) {
    const sourceDir = path.posix.dirname(sourcePath);
    if (language === 'Python') {
      const dots = rawImport.match(/^\.+/)?.[0].length || 1;
      let baseDir = sourceDir;
      for (let d = 1; d < dots; d++) {
        baseDir = path.posix.dirname(baseDir);
      }
      const modRest = rawImport.slice(dots).replace(/\./g, '/');
      const candidates = modRest
        ? [
            path.posix.join(baseDir, `${modRest}.py`),
            path.posix.join(baseDir, modRest, '__init__.py'),
          ]
        : [path.posix.join(baseDir, '__init__.py')];
      for (const c of candidates) {
        const norm = path.posix.normalize(c);
        if (allPaths.has(norm)) return norm;
      }
      return null;
    }

    const base = path.posix.normalize(path.posix.join(sourceDir === '.' ? '' : sourceDir, rawImport));
    const exts = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
    for (const ext of exts) {
      const candidate = base.replace(/\.(ts|tsx|js|jsx)$/, '') + ext;
      if (allPaths.has(candidate)) return candidate;
      if (allPaths.has(base + ext)) return base + ext;
    }
    return null;
  }

  // Absolute or module import (Python dotted or TS alias @/)
  if (rawImport.startsWith('@/')) {
    const stripped = rawImport.slice(2);
    for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']) {
      if (allPaths.has(stripped + ext)) return stripped + ext;
    }
  }

  if (language === 'Python') {
    const asPath = rawImport.replace(/\./g, '/');
    const candidates = [`${asPath}.py`, `${asPath}/__init__.py`];
    for (const c of candidates) {
      if (allPaths.has(c)) return c;
    }
    // Check suffix match for nested packages like backend.app.models -> backend/app/models.py or app/models.py
    for (const p of allPaths) {
      if (p.endsWith(`/${asPath}.py`) || p.endsWith(`/${asPath}/__init__.py`)) {
        return p;
      }
    }
    // Partial prefix match (e.g., from tracker.models import Task -> tracker/models.py)
    const parts = rawImport.split('.');
    while (parts.length > 1) {
      parts.pop();
      const sub = parts.join('/');
      if (allPaths.has(`${sub}.py`)) return `${sub}.py`;
    }
  }

  return null;
}

function buildTree(paths: string[], files: Record<string, FileRecord>): TreeNode[] {
  const root: TreeNode[] = [];

  for (const p of paths) {
    const parts = p.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const curPath = parts.slice(0, i + 1).join('/');
      let node = current.find((n) => n.name === part && n.type === (isFile ? 'file' : 'dir'));
      if (!node) {
        node = isFile
          ? {
              name: part,
              type: 'file',
              path: p,
              language: files[p]?.language,
              lines: files[p]?.lines,
            }
          : {
              name: part,
              type: 'dir',
              path: curPath,
              children: [],
            };
        current.push(node);
      }
      if (!isFile) {
        current = node.children!;
      }
    }
  }

  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children) sortNodes(n.children);
    }
  }
  sortNodes(root);
  return root;
}

function detectCycles(nodes: string[], adj: Map<string, Set<string>>): { modules: string[]; path: string[] }[] {
  const cycles: { modules: string[]; path: string[] }[] = [];
  const seenKeys = new Set<string>();
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  function dfs(u: string) {
    state.set(u, 'visiting');
    stack.push(u);
    const neighbors = adj.get(u) || new Set<string>();
    for (const v of neighbors) {
      if (state.get(v) === 'visiting') {
        const idx = stack.indexOf(v);
        if (idx !== -1) {
          const cyc = stack.slice(idx);
          const key = [...cyc].sort().join('|');
          if (!seenKeys.has(key) && cycles.length < 25) {
            seenKeys.add(key);
            cycles.push({ modules: cyc, path: [...cyc, v] });
          }
        }
      } else if (!state.has(v)) {
        dfs(v);
      }
    }
    stack.pop();
    state.set(u, 'done');
  }

  for (const n of nodes) {
    if (!state.has(n)) dfs(n);
  }
  return cycles;
}

export function scanRepository(rootDir: string): {
  tree: TreeNode[];
  files: Record<string, FileRecord>;
  languages: LangStat[];
  frameworks: string[];
  manifests: ManifestInfo[];
  graph: DependencyGraph;
  totalFiles: number;
  totalLines: number;
  totalSymbols: number;
  analysisMs: number;
} {
  const start = performance.now();
  const relPaths = walkFiles(rootDir);
  const pathSet = new Set(relPaths);

  const files: Record<string, FileRecord> = {};
  const rawImportMap = new Map<string, string[]>();
  const langTotals = new Map<string, { files: number; lines: number }>();
  const manifests: ManifestInfo[] = [];
  const frameworkSet = new Set<string>();

  let totalLines = 0;
  let totalSymbols = 0;

  for (const relPath of relPaths) {
    const full = path.join(rootDir, relPath);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.size > MAX_FILE_BYTES) continue;

    let buf: Buffer;
    try {
      buf = fs.readFileSync(full);
    } catch {
      continue;
    }
    // Skip binary files
    if (buf.subarray(0, 1024).includes(0)) continue;

    const content = buf.toString('utf8');
    const linesArr = content.split('\n');
    const lineCount = linesArr.length;
    const codeLines = linesArr.filter((l) => l.trim().length > 0).length;
    const ext = path.extname(relPath).toLowerCase();
    const language = EXT_LANG[ext] || 'Other';

    totalLines += lineCount;
    const curLang = langTotals.get(language) || { files: 0, lines: 0 };
    curLang.files += 1;
    curLang.lines += lineCount;
    langTotals.set(language, curLang);

    const parsed = CODE_LANGS.has(language)
      ? parseSymbolsAndImports(relPath, language, content)
      : { symbols: [], endpoints: [], rawImports: [] };

    totalSymbols += parsed.symbols.length;
    rawImportMap.set(relPath, parsed.rawImports);

    const maxComplexity = parsed.symbols.reduce((m, s) => Math.max(m, s.complexity), 1);
    const fnSymbols = parsed.symbols.filter((s) => s.kind !== 'class');
    const avgComplexity =
      fnSymbols.length > 0
        ? Number((fnSymbols.reduce((sum, s) => sum + s.complexity, 0) / fnSymbols.length).toFixed(2))
        : 1;

    files[relPath] = {
      path: relPath,
      name: path.posix.basename(relPath),
      dir: path.posix.dirname(relPath) === '.' ? 'root' : path.posix.dirname(relPath),
      language,
      lines: lineCount,
      codeLines,
      bytes: stat.size,
      isTest: isTestPath(relPath),
      imports: [],
      externalImports: [],
      symbols: parsed.symbols,
      endpoints: parsed.endpoints,
      maxComplexity,
      avgComplexity,
      content,
    };

    // Manifest & framework detection
    const baseName = path.posix.basename(relPath);
    if (baseName === 'package.json') {
      try {
        const pkg = JSON.parse(content);
        const deps: { name: string; version: string; dev: boolean }[] = [];
        for (const [k, v] of Object.entries(pkg.dependencies || {})) {
          deps.push({ name: k, version: String(v), dev: false });
          if (k === 'react') frameworkSet.add('React');
          if (k === 'next') frameworkSet.add('Next.js');
          if (k === 'express') frameworkSet.add('Express');
          if (k === 'vite') frameworkSet.add('Vite');
          if (k === 'tailwindcss' || k === '@tailwindcss/vite') frameworkSet.add('Tailwind CSS');
          if (k === 'vitest') frameworkSet.add('Vitest');
          if (k === 'jest') frameworkSet.add('Jest');
        }
        for (const [k, v] of Object.entries(pkg.devDependencies || {})) {
          deps.push({ name: k, version: String(v), dev: true });
          if (k === 'typescript') frameworkSet.add('TypeScript');
          if (k === 'vitest') frameworkSet.add('Vitest');
          if (k === 'jest') frameworkSet.add('Jest');
        }
        manifests.push({ file: relPath, type: 'npm', dependencies: deps });
      } catch {
        // Ignore malformed package.json
      }
    } else if (baseName === 'requirements.txt') {
      const deps: { name: string; version: string; dev: boolean }[] = [];
      for (const raw of linesArr) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const m = line.match(/^([A-Za-z0-9_.-]+)(.*)$/);
        if (m) {
          const pkgName = m[1].toLowerCase();
          deps.push({ name: m[1], version: m[2]?.trim() || '*', dev: false });
          if (pkgName === 'fastapi') frameworkSet.add('FastAPI');
          if (pkgName === 'flask') frameworkSet.add('Flask');
          if (pkgName === 'django') frameworkSet.add('Django');
          if (pkgName === 'pytest') frameworkSet.add('Pytest');
          if (pkgName === 'pydantic') frameworkSet.add('Pydantic');
          if (pkgName === 'langgraph') frameworkSet.add('LangGraph');
        }
      }
      manifests.push({ file: relPath, type: 'pip', dependencies: deps });
    }
  }

  // Resolve internal vs external imports
  const adj = new Map<string, Set<string>>();
  const revAdj = new Map<string, Set<string>>();
  const extCounts = new Map<string, number>();

  for (const [relPath, fileRec] of Object.entries(files)) {
    const rawList = rawImportMap.get(relPath) || [];
    const internalSet = new Set<string>();
    const externalSet = new Set<string>();

    for (const imp of rawList) {
      const resolved = resolveImportTarget(relPath, imp, pathSet, fileRec.language);
      if (resolved && resolved !== relPath) {
        internalSet.add(resolved);
        if (!adj.has(relPath)) adj.set(relPath, new Set());
        adj.get(relPath)!.add(resolved);
        if (!revAdj.has(resolved)) revAdj.set(resolved, new Set());
        revAdj.get(resolved)!.add(relPath);
      } else if (!imp.startsWith('.')) {
        const rootPkg = imp.startsWith('@') ? imp.split('/').slice(0, 2).join('/') : imp.split(/[/.]/)[0];
        if (rootPkg) {
          externalSet.add(rootPkg);
          extCounts.set(rootPkg, (extCounts.get(rootPkg) || 0) + 1);
        }
      }
    }

    fileRec.imports = [...internalSet];
    fileRec.externalImports = [...externalSet];
  }

  const codeNodes: ArchNode[] = [];
  const edges: ArchEdge[] = [];
  const codeIds: string[] = [];

  for (const fileRec of Object.values(files)) {
    if (!CODE_LANGS.has(fileRec.language)) continue;
    const fanOut = adj.get(fileRec.path)?.size || 0;
    const fanIn = revAdj.get(fileRec.path)?.size || 0;
    codeIds.push(fileRec.path);
    codeNodes.push({
      id: fileRec.path,
      path: fileRec.path,
      language: fileRec.language,
      lines: fileRec.lines,
      functions: fileRec.symbols.filter((s) => s.kind !== 'class').length,
      classes: fileRec.symbols.filter((s) => s.kind === 'class').length,
      fanIn,
      fanOut,
      maxComplexity: fileRec.maxComplexity,
      isTest: fileRec.isTest,
      externalImports: fileRec.externalImports,
    });
    for (const target of adj.get(fileRec.path) || []) {
      edges.push({ source: fileRec.path, target, lines: [1] });
    }
  }

  const cycles = detectCycles(codeIds, adj);
  const hubs = [...codeNodes]
    .filter((n) => n.fanIn + n.fanOut > 0)
    .sort((a, b) => b.fanIn * 2 + b.fanOut - (a.fanIn * 2 + a.fanOut))
    .slice(0, 5);
  const entryPoints = codeNodes.filter((n) => n.fanIn === 0 && n.fanOut > 0 && !n.isTest).map((n) => n.path);
  const isolated = codeNodes.filter((n) => n.fanIn === 0 && n.fanOut === 0).map((n) => n.path);
  const topExternal = [...extCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  const facts: string[] = [
    `${codeNodes.length} code modules connected by ${edges.length} internal import edges.`,
    cycles.length > 0
      ? `Detected ${cycles.length} circular dependency cycle(s) requiring decoupling.`
      : 'No circular internal import cycles detected.',
  ];
  if (hubs[0]) {
    facts.push(`Primary structural hub: ${hubs[0].path} (fan-in ${hubs[0].fanIn}, fan-out ${hubs[0].fanOut}).`);
  }

  const languages: LangStat[] = [...langTotals.entries()]
    .sort((a, b) => b[1].lines - a[1].lines)
    .map(([language, s]) => ({
      language,
      files: s.files,
      lines: s.lines,
      percentage: totalLines > 0 ? Number(((s.lines / totalLines) * 100).toFixed(1)) : 0,
    }));

  const tree = buildTree(Object.keys(files), files);
  const analysisMs = Number((performance.now() - start).toFixed(2));

  return {
    tree,
    files,
    languages,
    frameworks: [...frameworkSet].sort(),
    manifests,
    graph: {
      nodes: codeNodes,
      edges,
      cycles,
      facts: { facts, hubs, entryPoints, isolated, topExternal },
    },
    totalFiles: Object.keys(files).length,
    totalLines,
    totalSymbols,
    analysisMs,
  };
}
