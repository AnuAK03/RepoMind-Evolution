import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  Plus,
  Upload,
  Waypoints,
  Zap,
} from 'lucide-react';
import { api } from '../api';
import type {
  BreadcrumbContextUpdate,
  BreadcrumbSegment,
  FileRecord,
  FileSummary,
  GitHistoryData,
  OpenFileFn,
  RepoMeta,
  RiskSummaryResult,
  TreeNode,
} from '../types';
import {
  CodeViewer,
  EmptyState,
  ErrorBanner,
  FileTreeView,
  LoadingState,
  SearchInput,
  SectionHeader,
  SeverityLabel,
  Surface,
} from '../components/UiPrimitives';
import {
  LanguageSpectrumBar,
  RadialScoreGauge,
  RiskScatterChart,
} from '../components/VisualCharts';

export function IngestPanel({
  onIngested,
  onCancel,
}: {
  onIngested: (repo: RepoMeta) => void;
  onCancel?: () => void;
}) {
  const [mode, setMode] = useState<'git' | 'zip'>('git');
  const [gitUrl, setGitUrl] = useState('https://github.com/anuak01/RepoMind');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSample = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.postJson<{ repository: RepoMeta }>('/api/repos/sample', {});
      onIngested(res.repository);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sample repository.');
    } finally {
      setLoading(false);
    }
  };

  const handleGitClone = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.postJson<{ repository: RepoMeta }>('/api/repos/git', { url: gitUrl });
      onIngested(res.repository);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Git clone failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.postForm<{ repository: RepoMeta }>('/api/repos/zip', form);
      onIngested(res.repository);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ZIP ingestion failed.');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  return (
    <Surface className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Connect Repository
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            Clone a public HTTPS Git repository (full commit history) or upload a ZIP snapshot.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMode('git')}
              className={`rounded px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                mode === 'git'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Git URL
            </button>
            <button
              type="button"
              onClick={() => setMode('zip')}
              className={`rounded px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                mode === 'zip'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              ZIP Archive
            </button>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={handleSample}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Zap className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            Sample Repo
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Close
            </button>
          )}
        </div>
      </div>

      <div className="mt-4">
        {mode === 'git' ? (
          <form onSubmit={handleGitClone} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <GitBranch className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="url"
                required
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                placeholder="https://github.com/owner/repository"
                className="w-full rounded-md border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {loading ? 'Cloning & Indexing...' : 'Clone & Analyze'}
            </button>
          </form>
        ) : (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center hover:border-blue-500 dark:border-slate-700 dark:bg-slate-950">
            <Upload className="h-5 w-5 text-slate-400" />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {loading ? 'Extracting & Indexing ZIP...' : 'Drop or select a .zip archive (max 45 MB)'}
            </span>
            <span className="text-[11px] text-slate-500">
              Path-traversal protected · .git and symlinks are automatically ignored
            </span>
            <input type="file" accept=".zip" onChange={handleZipUpload} disabled={loading} className="hidden" />
          </label>
        )}
      </div>

      {error && (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      )}
    </Surface>
  );
}

export function RepositoryHubPage({
  repoId,
  meta,
  onIngested,
  onOpenFile,
  onAnalyzeImpact,
  showIngest,
  setShowIngest,
  onBreadcrumbChange,
}: {
  repoId: string | null;
  meta: RepoMeta | null;
  onIngested: (repo: RepoMeta) => void;
  onOpenFile: OpenFileFn;
  onAnalyzeImpact: (file: string, commit?: string) => void;
  showIngest: boolean;
  setShowIngest: (v: boolean) => void;
  onBreadcrumbChange?: (ctx: BreadcrumbContextUpdate) => void;
}) {
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [risk, setRisk] = useState<RiskSummaryResult | null>(null);
  const [git, setGit] = useState<GitHistoryData | null>(null);
  const [search, setSearch] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'complexity' | 'lines' | 'symbols'>('complexity');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!repoId) return;
    let active = true;
    setLoading(true);
    setError(null);
    setSelectedLanguage(null);
    Promise.all([
      api.get<{ meta: RepoMeta; tree: TreeNode[]; files: FileSummary[] }>(`/api/repos/${repoId}/overview`),
      api.get<RiskSummaryResult>(`/api/repos/${repoId}/risk`),
      api.get<GitHistoryData>(`/api/repos/${repoId}/git`),
    ])
      .then(([ov, r, g]) => {
        if (!active) return;
        setFiles(ov.files);
        setRisk(r);
        setGit(g);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load repository overview.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repoId]);

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = files.filter((f) => {
      if (selectedLanguage && f.language !== selectedLanguage) return false;
      if (q && !f.path.toLowerCase().includes(q) && !f.language.toLowerCase().includes(q)) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'lines') return b.lines - a.lines;
      if (sortBy === 'symbols') return b.symbols - a.symbols;
      return b.maxComplexity - a.maxComplexity || b.lines - a.lines;
    });
  }, [files, search, selectedLanguage, sortBy]);

  useEffect(() => {
    onBreadcrumbChange?.({
      segments: showIngest ? [{ id: 'connect-repo', label: 'Add Repo' }] : [],
      activeFilePath: null,
      onResetView: () => setShowIngest(false),
    });
  }, [showIngest, setShowIngest, onBreadcrumbChange]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Project Summary"
        description="Files, languages, risky spots, and latest code changes."
        actions={
          <button
            type="button"
            onClick={() => setShowIngest(!showIngest)}
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60"
          >
            <Plus className="h-3.5 w-3.5" />
            {showIngest ? 'Close Form' : 'Add Repo'}
          </button>
        }
      />

      {(showIngest || !meta) && (
        <IngestPanel
          onIngested={(r) => {
            onIngested(r);
            setShowIngest(false);
          }}
          onCancel={meta ? () => setShowIngest(false) : undefined}
        />
      )}

      {!meta && !loading && (
        <EmptyState
          title="No active repository"
          description="Clone a public HTTPS Git repository, upload a ZIP archive, or load the sample Git repository to start debugging and inspecting."
        />
      )}

      {loading && <LoadingState label="Indexing files, symbols, and commit history..." />}
      {error && <ErrorBanner message={error} />}

      {meta && !loading && (
        <>
          <Surface className="overflow-hidden border-t-2 border-t-blue-500">
            <div className="grid divide-y divide-slate-200 dark:divide-slate-800 lg:grid-cols-12 lg:divide-x lg:divide-y-0">
              <div className="flex flex-col justify-between gap-5 p-5 lg:col-span-8">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <FolderGit2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      <span className="capitalize">{meta.source}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate font-mono" title={meta.sourceRef}>
                        {meta.sourceRef}
                      </span>
                      {meta.hasGitHistory && git?.branch && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-cyan-700 dark:text-cyan-400">
                            branch {git.branch}
                          </span>
                        </>
                      )}
                    </div>
                    <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                      {meta.name}
                    </h2>
                  </div>

                  {meta.frameworks.length > 0 && (
                    <div className="text-right text-xs text-indigo-600 dark:text-indigo-400">
                      {meta.frameworks.slice(0, 4).join(' · ')}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Click a language to filter files</span>
                    {selectedLanguage && (
                      <button
                        type="button"
                        onClick={() => setSelectedLanguage(null)}
                        className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Showing {selectedLanguage} · Clear
                      </button>
                    )}
                  </div>
                  <LanguageSpectrumBar
                    languages={meta.languages}
                    activeLanguage={selectedLanguage}
                    onSelectLanguage={setSelectedLanguage}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 dark:border-slate-800 sm:grid-cols-4">
                  <div>
                    <div className="text-[11px] text-slate-500">Total Files</div>
                    <div className="mt-0.5 font-mono text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">
                      {meta.totalFiles}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Lines of Code</div>
                    <div className="mt-0.5 font-mono text-lg font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
                      {meta.totalLines.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Functions &amp; Classes</div>
                    <div className="mt-0.5 font-mono text-lg font-bold tabular-nums text-cyan-700 dark:text-cyan-400">
                      {meta.totalSymbols}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Commits</div>
                    <div className="mt-0.5 font-mono text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {meta.hasGitHistory ? meta.commitCount : 'ZIP'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-4 bg-slate-50/80 p-5 dark:bg-slate-950/60 lg:col-span-4">
                <RadialScoreGauge
                  score={risk?.averageScore ?? 0}
                  tone="risk"
                  label="Average Risk"
                  sublabel={`${risk?.files.length ?? meta.totalFiles} code files checked`}
                  size={104}
                />

                {risk && (
                  <div className="grid grid-cols-4 gap-2 border-t border-slate-200/80 pt-3 text-center dark:border-slate-800">
                    <div>
                      <div className="font-mono text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">
                        {risk.distribution.critical}
                      </div>
                      <div className="text-[10px] text-slate-500">Critical</div>
                    </div>
                    <div>
                      <div className="font-mono text-sm font-bold tabular-nums text-orange-600 dark:text-orange-400">
                        {risk.distribution.high}
                      </div>
                      <div className="text-[10px] text-slate-500">High</div>
                    </div>
                    <div>
                      <div className="font-mono text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">
                        {risk.distribution.medium}
                      </div>
                      <div className="text-[10px] text-slate-500">Medium</div>
                    </div>
                    <div>
                      <div className="font-mono text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {risk.distribution.low}
                      </div>
                      <div className="text-[10px] text-slate-500">Safe</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Surface>

          {risk && risk.files.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-12">
              <Surface className="border-t-2 border-t-rose-500 p-5 lg:col-span-7">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Risk vs. Complexity Map
                    </h3>
                    <p className="text-xs text-slate-500">
                      Click any bubble to open that file
                    </p>
                  </div>
                </div>
                <RiskScatterChart
                  files={risk.files}
                  onSelectFile={(f) => onOpenFile(f.path)}
                />
              </Surface>

              <Surface className="border-t-2 border-t-amber-500 p-5 lg:col-span-5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Riskiest Files
                  </h3>
                  <span className="text-xs text-slate-500">Top 5</span>
                </div>
                <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800/70">
                  {risk.files.slice(0, 5).map((f) => (
                    <div key={f.path} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onOpenFile(f.path)}
                          className="truncate font-mono font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {f.path}
                        </button>
                        <div className="mt-0.5 truncate text-[11px] text-slate-500">{f.explanation}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
                        <SeverityLabel level={f.category} />
                        <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                          {f.score}
                        </span>
                        <button
                          type="button"
                          onClick={() => onAnalyzeImpact(f.path)}
                          title="See what breaks"
                          className="rounded border border-slate-200 p-1 text-slate-500 hover:border-blue-500 hover:text-blue-600 dark:border-slate-700"
                        >
                          <Waypoints className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Surface>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Surface className="border-t-2 border-t-cyan-500 p-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Latest Changes
                </h3>
                <span className="text-xs text-slate-500">
                  {git?.available ? `${git.totalCommits} commits` : 'No Git'}
                </span>
              </div>
              {!git?.available ? (
                <p className="mt-4 text-xs text-slate-500">
                  Commit history is excluded in ZIP archives. Connect via Git URL to inspect commit logs.
                </p>
              ) : (
                <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800/70">
                  {git.commits.slice(0, 5).map((c) => (
                    <div key={c.sha} className="flex items-start justify-between gap-3 py-2.5 text-xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                            {c.shortSha}
                          </span>
                          <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                            {c.subject}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {c.author} · {c.date.slice(0, 10)} · {c.files.length} files
                        </div>
                      </div>
                      <div className="shrink-0 font-mono text-[11px] tabular-nums">
                        <span className="text-emerald-600 dark:text-emerald-400">+{c.additions}</span>{' '}
                        <span className="text-red-600 dark:text-red-400">-{c.deletions}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Surface>

            <Surface className="border-t-2 border-t-indigo-500 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Packages &amp; Tools
                </h3>
                <span className="text-xs text-slate-500">
                  {meta.frameworks.length > 0 ? meta.frameworks.join(' · ') : 'No manifest'}
                </span>
              </div>
              {meta.manifests.length === 0 ? (
                <p className="mt-4 text-xs text-slate-500">No package.json or requirements.txt found.</p>
              ) : (
                <div className="mt-3 max-h-60 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-white dark:bg-slate-900">
                      <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                        <th className="py-2 pr-4 font-medium">File</th>
                        <th className="py-2 pr-4 font-medium">Package</th>
                        <th className="py-2 pr-4 font-medium">Version</th>
                        <th className="py-2 text-right font-medium">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {meta.manifests.flatMap((m) =>
                        m.dependencies.slice(0, 16).map((d) => (
                          <tr key={`${m.file}:${d.name}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-1.5 pr-4 font-mono text-slate-500">{m.file}</td>
                            <td className="py-1.5 pr-4 font-mono font-medium text-slate-800 dark:text-slate-200">
                              {d.name}
                            </td>
                            <td className="py-1.5 pr-4 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                              {d.version}
                            </td>
                            <td className="py-1.5 text-right text-slate-500">{d.dev ? 'Dev' : 'App'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </Surface>
          </div>

          <Surface className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  All Files ({filteredFiles.length})
                </h3>
                <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5 dark:bg-slate-800/80">
                  {(
                    [
                      ['complexity', 'Complexity'],
                      ['lines', 'Size'],
                      ['symbols', 'Functions'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSortBy(val)}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
                        sortBy === val
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      Sort: {label}
                    </button>
                  ))}
                </div>
              </div>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search file or language..."
                className="w-64"
              />
            </div>
            <div className="mt-2 max-h-96 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-white dark:bg-slate-900">
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                    <th className="py-2 pr-4 font-medium">Path</th>
                    <th className="py-2 pr-4 font-medium">Language</th>
                    <th className="py-2 pr-4 text-right font-medium">Lines</th>
                    <th className="py-2 pr-4 text-right font-medium">Symbols</th>
                    <th className="py-2 pr-4 text-right font-medium">Max CC</th>
                    <th className="py-2 text-right font-medium">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {filteredFiles.map((f) => (
                    <tr key={f.path} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2 pr-4">
                        <button
                          type="button"
                          onClick={() => onOpenFile(f.path)}
                          className="font-mono text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {f.path}
                        </button>
                      </td>
                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{f.language}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">{f.lines}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">{f.symbols}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">{f.maxComplexity}</td>
                      <td className="py-2 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenFile(f.path)}
                            className="inline-flex items-center gap-0.5 text-slate-600 hover:text-blue-600 dark:text-slate-400"
                          >
                            Source
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                          {!f.isTest && f.symbols > 0 && (
                            <button
                              type="button"
                              onClick={() => onAnalyzeImpact(f.path)}
                              className="text-blue-600 hover:underline dark:text-blue-400"
                            >
                              Impact
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>
        </>
      )}
    </div>
  );
}

export function ExplorerPage({
  repoId,
  target,
  onAnalyzeImpact,
  onBreadcrumbChange,
}: {
  repoId: string;
  target: { path: string; line?: number } | null;
  onAnalyzeImpact: (file: string) => void;
  onBreadcrumbChange?: (ctx: BreadcrumbContextUpdate) => void;
}) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [allFiles, setAllFiles] = useState<FileSummary[]>([]);
  const [treeFilter, setTreeFilter] = useState('');
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(target?.path || null);
  const [highlightLine, setHighlightLine] = useState<number | null>(target?.line || null);
  const [file, setFile] = useState<FileRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target?.path) {
      setSelectedPath(target.path);
      setSelectedDir(null);
      setHighlightLine(target.line || null);
    }
  }, [target]);

  useEffect(() => {
    let active = true;
    api
      .get<{ tree: TreeNode[]; files: FileSummary[] }>(`/api/repos/${repoId}/overview`)
      .then((res) => {
        if (!active) return;
        setTree(res.tree);
        setAllFiles(res.files);
        if (!selectedPath && !selectedDir && res.files[0]) {
          setSelectedPath(res.files[0].path);
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load tree.');
      });
    return () => {
      active = false;
    };
  }, [repoId]);

  useEffect(() => {
    if (!selectedPath) {
      setFile(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    api
      .get<{ file: FileRecord }>(`/api/repos/${repoId}/file?path=${encodeURIComponent(selectedPath)}`)
      .then((res) => {
        if (active) setFile(res.file);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load file.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repoId, selectedPath]);

  const directoryFiles = useMemo(() => {
    if (!selectedDir) return [];
    const prefix = `${selectedDir}/`;
    return allFiles
      .filter((f) => f.path.startsWith(prefix))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [allFiles, selectedDir]);

  useEffect(() => {
    const segments: BreadcrumbSegment[] = [];
    const activePath = selectedPath || selectedDir;
    if (activePath) {
      const parts = activePath.split('/').filter(Boolean);
      const isDirView = Boolean(selectedDir && !selectedPath);
      parts.forEach((part, idx) => {
        const prefix = parts.slice(0, idx + 1).join('/');
        const isFilePart = !isDirView && idx === parts.length - 1;
        if (!isFilePart) {
          segments.push({
            id: `dir-${prefix}`,
            label: part,
            mono: true,
            title: `Browse folder ${prefix}/`,
            onClick: () => {
              setSelectedDir(prefix);
              setSelectedPath(null);
              setHighlightLine(null);
              setTreeFilter(`${prefix}/`);
            },
          });
        } else {
          segments.push({
            id: `file-${prefix}`,
            label: part,
            mono: true,
            title: prefix,
            onClick: highlightLine ? () => setHighlightLine(null) : undefined,
          });
        }
      });

      if (selectedPath && highlightLine) {
        const matchedSymbol = file?.symbols.find((s) => s.line === highlightLine);
        segments.push({
          id: `line-${highlightLine}`,
          label: matchedSymbol ? `${matchedSymbol.name} · L${highlightLine}` : `Line ${highlightLine}`,
          mono: true,
          title: matchedSymbol
            ? `${matchedSymbol.kind} ${matchedSymbol.name} at line ${highlightLine}`
            : `Line ${highlightLine}`,
        });
      }
    }

    onBreadcrumbChange?.({
      segments,
      activeFilePath: selectedPath,
      onResetView: () => {
        setSelectedDir(null);
        setTreeFilter('');
        setHighlightLine(null);
        if (!selectedPath && allFiles[0]) {
          setSelectedPath(allFiles[0].path);
        }
      },
    });
  }, [selectedPath, selectedDir, highlightLine, file, allFiles, onBreadcrumbChange]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Code Viewer"
        description="Read any file, jump straight to functions, and check what depends on it."
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid gap-4 lg:grid-cols-12">
        <Surface className="flex max-h-[75vh] flex-col p-3 lg:col-span-3">
          <SearchInput
            value={treeFilter}
            onChange={(val) => {
              setTreeFilter(val);
              if (!val.trim()) setSelectedDir(null);
            }}
            placeholder="Filter tree..."
            className="mb-2.5"
          />
          <div className="min-h-0 flex-1 overflow-auto">
            <FileTreeView
              nodes={tree}
              selectedPath={selectedPath}
              filterQuery={treeFilter}
              onSelect={(p) => {
                setSelectedDir(null);
                setSelectedPath(p);
                setHighlightLine(null);
              }}
            />
          </div>
        </Surface>

        <div className="space-y-4 lg:col-span-9">
          {loading && <LoadingState label="Reading file source..." />}

          {!selectedPath && selectedDir && !loading && (
            <Surface className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
                <div>
                  <div className="text-xs text-slate-500">Directory</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {selectedDir}/
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDir(null);
                    setTreeFilter('');
                    if (allFiles[0]) setSelectedPath(allFiles[0].path);
                  }}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Show All Files
                </button>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                      <th className="py-2 pr-4 font-medium">File</th>
                      <th className="py-2 pr-4 font-medium">Language</th>
                      <th className="py-2 pr-4 text-right font-medium">Lines</th>
                      <th className="py-2 pr-4 text-right font-medium">Symbols</th>
                      <th className="py-2 text-right font-medium">Max CC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {directoryFiles.map((f) => (
                      <tr key={f.path} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2 pr-4">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDir(null);
                              setSelectedPath(f.path);
                              setHighlightLine(null);
                            }}
                            className="font-mono font-medium text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {f.path.slice(selectedDir.length + 1)}
                          </button>
                        </td>
                        <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{f.language}</td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums">{f.lines}</td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums">{f.symbols}</td>
                        <td className="py-2 text-right font-mono tabular-nums">{f.maxComplexity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Surface>
          )}

          {file && !loading && (
            <>
              <Surface className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {file.path}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
                      {file.language} · {file.lines} lines · Max CC {file.maxComplexity} · {file.imports.length} internal imports
                    </div>
                  </div>
                  {!file.isTest && (
                    <button
                      type="button"
                      onClick={() => onAnalyzeImpact(file.path)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-blue-500 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <Waypoints className="h-3.5 w-3.5" />
                      Trace Impact
                    </button>
                  )}
                </div>

                {file.symbols.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                    {file.symbols.map((s) => (
                      <button
                        key={`${s.name}:${s.line}`}
                        type="button"
                        onClick={() => setHighlightLine(s.line)}
                        className={`rounded border px-2 py-1 font-mono text-[11px] transition-colors ${
                          highlightLine === s.line
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                            : 'border-slate-200 text-slate-700 hover:border-blue-500 dark:border-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {s.kind} {s.name} · L{s.line} · CC {s.complexity}
                      </button>
                    ))}
                  </div>
                )}
              </Surface>

              <CodeViewer content={file.content} highlightLine={highlightLine} language={file.language} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
