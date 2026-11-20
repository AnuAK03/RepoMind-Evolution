import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import type { RepoWorkspace } from './server/types.ts';
import {
  MAX_ZIP_BYTES,
  WORKSPACE_ROOT,
  ensureWorkspaceRoot,
  safeExtractZip,
  scanRepository,
} from './server/scanner.ts';
import {
  cloneGitRepository,
  compareGitCommits,
  ensureSampleGitRepo,
  extractGitHistory,
  runGit,
} from './server/gitintel.ts';
import {
  buildMarkdownReport,
  buildRiskCsvReport,
  buildStakeholderSummary,
  compareGitRefsSummary,
  compareTwoWorkspaces,
  computeArchitectureEvolution,
  computeChangeImpact,
  computeContributorKnowledge,
  computeProjectHealth,
  computeRiskIntelligence,
  computeTechnicalDebt,
  computeTestImpact,
  runResearchEvaluation,
} from './server/analysis.ts';
import { askEngineeringAssistant } from './server/ai.ts';

const PORT = 3000;
const app = express();
app.use(express.json({ limit: '2mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ZIP_BYTES },
});

const repoStore = new Map<string, RepoWorkspace>();

async function indexDirectory(
  id: string,
  name: string,
  source: RepoWorkspace['meta']['source'],
  sourceRef: string,
  rootDir: string
): Promise<RepoWorkspace> {
  const scan = scanRepository(rootDir);
  const git = await extractGitHistory(rootDir);

  const workspace: RepoWorkspace = {
    meta: {
      id,
      name,
      source,
      sourceRef,
      createdAt: new Date().toISOString(),
      status: 'ready',
      totalFiles: scan.totalFiles,
      totalLines: scan.totalLines,
      totalSymbols: scan.totalSymbols,
      languages: scan.languages,
      frameworks: scan.frameworks,
      manifests: scan.manifests,
      hasGitHistory: git.available,
      commitCount: git.totalCommits,
      analysisMs: scan.analysisMs,
    },
    rootDir,
    tree: scan.tree,
    files: scan.files,
    graph: scan.graph,
    git,
  };

  repoStore.set(id, workspace);
  return workspace;
}

function getRepoOr404(id: string, res: express.Response): RepoWorkspace | null {
  const ws = repoStore.get(id);
  if (!ws) {
    res.status(404).json({ error: `Repository "${id}" not found.` });
    return null;
  }
  return ws;
}

// Health check
app.get('/api/health', async (_req, res) => {
  let gitVersion = 'unavailable';
  try {
    gitVersion = (await runGit(['--version'])).trim();
  } catch {
    gitVersion = 'unavailable';
  }
  res.json({
    status: 'ok',
    gitVersion,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    geminiModel: 'gemini-4-hydrogen',
    loadedRepos: repoStore.size,
  });
});

// List analyzed repositories
app.get('/api/repos', (_req, res) => {
  const list = [...repoStore.values()]
    .map((w) => w.meta)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ repositories: list });
});

// Load built-in multi-commit Git sample repository
app.post('/api/repos/sample', async (_req, res) => {
  try {
    const existing = repoStore.get('sample-tasktracker');
    if (existing) {
      res.json({ repository: existing.meta });
      return;
    }
    const sampleDir = await ensureSampleGitRepo();
    const ws = await indexDirectory(
      'sample-tasktracker',
      'TaskTracker Evolution (Sample Git)',
      'sample',
      'local-git://tasktracker-evolution',
      sampleDir
    );
    res.json({ repository: ws.meta });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to initialize sample repository.';
    res.status(500).json({ error: msg });
  }
});

// Clone HTTPS Git repository
app.post('/api/repos/git', async (req, res) => {
  const url = String(req.body?.url || '').trim();
  if (!url) {
    res.status(400).json({ error: 'Repository HTTPS URL is required.' });
    return;
  }

  ensureWorkspaceRoot();
  const id = `git-${crypto.randomUUID().slice(0, 8)}`;
  const destDir = path.join(WORKSPACE_ROOT, id);

  try {
    await cloneGitRepository(url, destDir);
    const repoName = url.replace(/\.git$/i, '').split('/').filter(Boolean).pop() || id;
    const ws = await indexDirectory(id, repoName, 'git', url, destDir);
    res.json({ repository: ws.meta });
  } catch (err) {
    fs.rmSync(destDir, { recursive: true, force: true });
    const msg = err instanceof Error ? err.message : 'Git clone failed.';
    res.status(400).json({ error: msg });
  }
});

// Upload ZIP archive
app.post('/api/repos/zip', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No ZIP file uploaded.' });
    return;
  }
  const originalName = req.file.originalname || 'repository.zip';
  if (!originalName.toLowerCase().endsWith('.zip')) {
    res.status(400).json({ error: 'Only .zip archives are supported.' });
    return;
  }

  ensureWorkspaceRoot();
  const id = `zip-${crypto.randomUUID().slice(0, 8)}`;
  const destDir = path.join(WORKSPACE_ROOT, id);

  try {
    const { extractedFiles } = safeExtractZip(req.file.buffer, destDir);
    if (extractedFiles === 0) {
      throw new Error('No readable files were found in the ZIP archive.');
    }
    const repoName = originalName.replace(/\.zip$/i, '');
    const ws = await indexDirectory(id, repoName, 'zip', originalName, destDir);
    res.json({ repository: ws.meta });
  } catch (err) {
    fs.rmSync(destDir, { recursive: true, force: true });
    const msg = err instanceof Error ? err.message : 'ZIP extraction failed.';
    res.status(400).json({ error: msg });
  }
});

app.delete('/api/repos/:id', (req, res) => {
  const ws = getRepoOr404(req.params.id, res);
  if (!ws) return;
  repoStore.delete(ws.meta.id);
  if (ws.meta.source !== 'sample') {
    fs.rmSync(ws.rootDir, { recursive: true, force: true });
  }
  res.json({ deleted: true });
});

// Module 1: Overview & File Explorer
app.get('/api/repos/:id/overview', (req, res) => {
  const ws = getRepoOr404(req.params.id, res);
  if (!ws) return;
  const filesSummary = Object.values(ws.files).map((f) => ({
    path: f.path,
    language: f.language,
    lines: f.lines,
    symbols: f.symbols.length,
    maxComplexity: f.maxComplexity,
    isTest: f.isTest,
    endpoints: f.endpoints.length,
  }));
  res.json({
    meta: ws.meta,
    tree: ws.tree,
    files: filesSummary,
  });
});

app.get('/api/repos/:id/file', (req, res) => {
  const ws = getRepoOr404(req.params.id, res);
  if (!ws) return;
  const relPath = String(req.query.path || '');
  const file = ws.files[relPath];
  if (!file) {
    res.status(404).json({ error: `File "${relPath}" not found.` });
    return;
  }
  res.json({ file });
});

// Module 2: Git History & Evolution
app.get('/api/repos/:id/git', (req, res) => {
  const ws = getRepoOr404(req.params.id, res);
  if (!ws) return;
  res.json(ws.git);
});

app.get('/api/repos/:id/git/diff', async (req, res) => {
  const ws = getRepoOr404(req.params.id, res);
  if (!ws) return;
  if (!ws.git.available) {
    res.status(400).json({ error: 'Git history is not available for this repository.' });
    return;
  }
  const base = String(req.query.base || '');
  const head = String(req.query.head || '');
  if (!base || !head) {
    res.status(400).json({ error: 'Both base and head refs are required.' });
    return;
  }
  try {
    const diff = await compareGitCommits(ws.rootDir, base, head);
    res.json(diff);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Git diff failed.' });
  }
});

// Module 3: Change Impact Analysis Engine
app.get('/api/repos/:id/impact', (req, res) => {
  const ws = getRepoOr404(req.params.id, res);
  if (!ws) return;
  let targetFile = String(req.query.file || '');
  const targetSymbol = req.query.symbol ? String(req.query.symbol) : null;
  const commitSha = req.query.commit ? String(req.query.commit) : null;

  if (!targetFile && commitSha && ws.git.available) {
    const c = ws.git.commits.find((x) => x.sha === commitSha || x.shortSha === commitSha);
    targetFile = c?.files.find((f) => ws.files[f.path])?.path || '';
  }
  if (!targetFile) {
    targetFile = ws.graph.facts.hubs[0]?.path || ws.graph.nodes.find((n) => !n.isTest)?.path || Object.keys(ws.files)[0] || '';
  }

  try {
    const impact = computeChangeImpact(ws, targetFile, targetSymbol, commitSha);
    res.json(impact);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Impact analysis failed.' });
  }
});

// Module 4: Software Risk Intelligence
app.get('/api/repos/:id/risk', (req, res) => {
  const ws = getRepoOr404(req.params.id, res);
  if (!ws) return;
  res.json(computeRiskIntelligence(ws));
});

// Module 5: Technical Debt Intelligence
app.get('/api/repos/:id/debt', (req, res) => {
  const ws = getRepoOr404(req.params.id, res);
  if (!ws) return;
  res.json(computeTechnicalDebt(ws));
});

// Module 6: Test Impact Intelligence
app.get('/api/repos/:id/tests', (req, res) => {
  const ws = getRepoOr404(req.params.id, res);
  if (!ws) return;
  const target = req.query.target ? String(req.query.target) : null;
  res.json(computeTestImpact(ws, target));
});

// Module 7: Architecture & Evolution
app.get('/api/repos/:id/architecture', (req, res) => {
  const ws = getRepoOr404(req.params.id, res);
  if (!ws) return;
  res.json(ws.graph);
});

app.get('/api/repos/:id/architecture/evolution', async (req, res) => {
  const ws = getRepoOr404(req.params.id, res);
  if (!ws) return;
  if (!ws.git.available || ws.git.commits.length < 2) {
    res.status(400).json({ error: 'At least 2 Git commits are required to compare architectural snapshots.' });
    return;
  }
  const commits = ws.git.commits;
  const baseRef = String(req.query.base || commits[commits.length - 1].sha);
  const headRef = String(req.query.head || commits[0].sha);

  try {
    const evo = await computeArchitectureEvolution(ws, baseRef, headRef);
    res.json(evo);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Architecture evolution comparison failed.' });
  }
});

// Module 8: AI Software Engineering Assistant
app.post('/api/repos/:id/assistant', async (req, res) => {
  const ws = getRepoOr404(req.params.id, res);
  if (!ws) return;
  const question = String(req.body?.question || '');
  const focusFile = req.body?.focusFile ? String(req.body.focusFile) : undefined;
  const history = Array.isArray(req.body?.history) ? req.body.history : [];

  try {
    const result = await askEngineeringAssistant(ws, question, focusFile, history);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI assistant error.';
    const status = msg.includes('GEMINI_API_KEY') ? 503 : 500;
    res.status(status).json({ error: msg });
  }
});

// Module 9: Developer Knowledge Intelligence
app.get('/api/repos/:id/contributors', (req, res) => {
  const ws = getRepoOr404(req.params.id, res);
  if (!ws) return;
  res.json(computeContributorKnowledge(ws));
});

// Module 10: Project Health Dashboard
app.get('/api/repos/:id/health', (req, res) => {
  const ws = getRepoOr404(req.params.id, res);
  if (!ws) return;
  res.json(computeProjectHealth(ws));
});

// Module 11: Comparative Repository Analysis
app.get('/api/repos/:id/compare', async (req, res) => {
  const ws = getRepoOr404(req.params.id, res);
  if (!ws) return;
  const mode = String(req.query.mode || 'git_refs');

  try {
    if (mode === 'repositories') {
      const otherId = String(req.query.otherId || '');
      const other = repoStore.get(otherId);
      if (!other) {
        res.status(404).json({ error: 'Target comparison repository not found.' });
        return;
      }
      res.json(compareTwoWorkspaces(ws, other));
      return;
    }

    if (!ws.git.available || ws.git.commits.length < 2) {
      res.status(400).json({ error: 'At least 2 commits are needed for version comparison.' });
      return;
    }
    const leftRef = String(req.query.left || ws.git.commits[ws.git.commits.length - 1].sha);
    const rightRef = String(req.query.right || ws.git.commits[0].sha);
    res.json(await compareGitRefsSummary(ws, leftRef, rightRef));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Comparison failed.' });
  }
});

// Module 12: Live Research Evaluation & Reports
app.get('/api/repos/:id/evaluation', async (req, res) => {
  const ws = getRepoOr404(req.params.id, res);
  if (!ws) return;
  try {
    const result = await runResearchEvaluation(ws);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Evaluation failed.' });
  }
});

app.get('/api/repos/:id/report', async (req, res) => {
  const ws = getRepoOr404(req.params.id, res);
  if (!ws) return;
  const format = String(req.query.format || 'markdown').toLowerCase();

  try {
    if (format === 'csv') {
      const csv = buildRiskCsvReport(ws);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${ws.meta.id}-risk-report.csv"`);
      res.send(csv);
      return;
    }

    if (format === 'stakeholder') {
      const payload = await buildStakeholderSummary(ws);
      res.json(payload);
      return;
    }

    if (format === 'json') {
      const evaluation = await runResearchEvaluation(ws);
      const health = computeProjectHealth(ws);
      const risk = computeRiskIntelligence(ws);
      const debt = computeTechnicalDebt(ws);
      res.json({ meta: ws.meta, health, risk, debt, evaluation });
      return;
    }

    const markdown = await buildMarkdownReport(ws);
    if (req.query.download === '1') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${ws.meta.id}-stakeholder-summary.md"`);
      res.send(markdown);
      return;
    }
    res.json({ markdown });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Report generation failed.' });
  }
});

async function startServer() {
  ensureWorkspaceRoot();

  // Seed real sample Git repository on startup so workspace is immediately usable
  try {
    const sampleDir = await ensureSampleGitRepo();
    await indexDirectory(
      'sample-tasktracker',
      'TaskTracker Evolution (Sample Git)',
      'sample',
      'local-git://tasktracker-evolution',
      sampleDir
    );
  } catch (err) {
    console.error('Warning: failed to seed sample repository:', err);
  }

  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve('dist'));
  if (isProd) {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RepoMind Evolution server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
