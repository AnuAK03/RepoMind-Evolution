import React, { useEffect, useMemo, useState } from 'react';
import { Download, Send, Sparkles } from 'lucide-react';
import { api } from '../api';
import type {
  AssistantResponse,
  BreadcrumbContextUpdate,
  ContributorKnowledgeResult,
  FileSummary,
  HealthStatus,
  OpenFileFn,
  ProjectHealthResult,
} from '../types';
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  MarkdownText,
  SectionHeader,
  SeverityLabel,
  Surface,
} from '../components/UiPrimitives';
import { DimensionRadarChart, RadialScoreGauge } from '../components/VisualCharts';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  meta?: AssistantResponse;
}

export function AssistantPage({
  repoId,
  healthStatus,
  onOpenFile,
  onBreadcrumbChange,
}: {
  repoId: string;
  healthStatus: HealthStatus | null;
  onOpenFile: OpenFileFn;
  onBreadcrumbChange?: (ctx: BreadcrumbContextUpdate) => void;
}) {
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [focusFile, setFocusFile] = useState('');
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ files: FileSummary[] }>(`/api/repos/${repoId}/overview`)
      .then((res) => {
        const src = res.files.filter((f) => !f.isTest);
        setFiles(src);
        const pref = src.find((f) => f.path.includes('authentication')) || src[0];
        if (pref) setFocusFile(pref.path);
      })
      .catch(() => {});
  }, [repoId]);

  useEffect(() => {
    onBreadcrumbChange?.({
      segments: focusFile
        ? [{ id: `focus-${focusFile}`, label: focusFile, mono: true, title: `Focus: ${focusFile}` }]
        : [],
      activeFilePath: focusFile || null,
      onResetView: () => setFocusFile(''),
    });
  }, [focusFile, onBreadcrumbChange]);

  const sendQuestion = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setError(null);
    const historyPayload = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((prev) => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.postJson<AssistantResponse>(`/api/repos/${repoId}/assistant`, {
        question: trimmed,
        focusFile: focusFile || undefined,
        history: historyPayload,
      });
      setTurns((prev) => [...prev, { role: 'assistant', content: res.answer, meta: res }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assistant request failed.');
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    {
      label: 'Why is the top file risky?',
      query: 'Why is the top-ranked file risky, and which tests should run if it changes?',
      accent: 'hover:border-rose-500/60 hover:text-rose-600 dark:hover:text-rose-300',
    },
    {
      label: 'What breaks if login changes?',
      query: 'Trace downstream dependencies and affected routes for authentication or core services.',
      accent: 'hover:border-amber-500/60 hover:text-amber-600 dark:hover:text-amber-300',
    },
    {
      label: 'List top security & cleanup fixes',
      query: 'Summarize verified security findings and technical debt priorities with file paths.',
      accent: 'hover:border-emerald-500/60 hover:text-emerald-600 dark:hover:text-emerald-300',
    },
    {
      label: 'How did recent commits change links?',
      query: 'How have recent commits changed coupling and blast radius?',
      accent: 'hover:border-indigo-500/60 hover:text-indigo-600 dark:hover:text-indigo-300',
    },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Ask AI"
        description="Ask anything about files, risks, and tests with code links."
        actions={
          <select
            value={focusFile}
            onChange={(e) => setFocusFile(e.target.value)}
            className="max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 shadow-xs focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">Auto-pick file</option>
            {files.map((f) => (
              <option key={f.path} value={f.path}>
                Focus: {f.path}
              </option>
            ))}
          </select>
        }
      />

      {healthStatus && !healthStatus.geminiConfigured && (
        <ErrorBanner message="GEMINI_API_KEY is not set in Settings > Secrets. All code scanners still work; AI chat needs a server key." />
      )}

      {error && <ErrorBanner message={error} />}

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {quickPrompts.map((p) => (
          <button
            key={p.label}
            type="button"
            disabled={loading}
            onClick={() => sendQuestion(p.query)}
            className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 transition-colors disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 ${p.accent}`}
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
            <span className="truncate">{p.label}</span>
          </button>
        ))}
      </div>

      <Surface className="flex min-h-[26rem] flex-col justify-between border-t-2 border-t-indigo-500 p-5">
        <div className="space-y-4 overflow-y-auto">
          {turns.length === 0 && (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              Pick a quick question above or type your own below.
            </div>
          )}

          {turns.map((turn, idx) => (
            <div
              key={idx}
              className={`rounded-lg border p-4 ${
                turn.role === 'user'
                  ? 'border-blue-500/30 bg-blue-500/10'
                  : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/70'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {turn.role === 'user' ? 'You' : turn.meta?.specialistFocus || 'AI Answer'}
                </span>
                {turn.meta && <span className="font-mono text-[11px]">{turn.meta.model}</span>}
              </div>

              <div className="mt-2">
                {turn.role === 'user' ? (
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100">{turn.content}</p>
                ) : (
                  <MarkdownText text={turn.content} onOpenPath={onOpenFile} />
                )}
              </div>

              {turn.meta && turn.meta.citations.length > 0 && (
                <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                  <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    Proof From Code ({turn.meta.citations.length})
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {turn.meta.citations.map((cit, cIdx) => (
                      <button
                        key={`${cit.path}:${cit.line}:${cIdx}`}
                        type="button"
                        onClick={() => onOpenFile(cit.path, cit.line)}
                        className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-blue-600 transition-colors hover:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-400"
                      >
                        {cit.source} · {cit.path}:{cit.line}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && <LoadingState label="Checking your code and writing an answer..." />}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuestion(input);
          }}
          className="mt-4 flex gap-2 border-t border-slate-200 pt-4 dark:border-slate-800"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about risky files, dependencies, security, or tests..."
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            Ask
          </button>
        </form>
      </Surface>
    </div>
  );
}

export function ContributorsPage({
  repoId,
  onOpenFile,
  onBreadcrumbChange,
}: {
  repoId: string;
  onOpenFile: OpenFileFn;
  onBreadcrumbChange?: (ctx: BreadcrumbContextUpdate) => void;
}) {
  const [data, setData] = useState<ContributorKnowledgeResult | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'single_owner' | 'shared'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onBreadcrumbChange?.({ segments: [], activeFilePath: null });
  }, [onBreadcrumbChange]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get<ContributorKnowledgeResult>(`/api/repos/${repoId}/contributors`)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load team activity.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repoId]);

  const filteredFiles = useMemo(() => {
    if (!data) return [];
    if (ownerFilter === 'all') return data.fileConcentration;
    if (ownerFilter === 'single_owner') {
      return data.fileConcentration.filter((f) => f.concentrationLevel === 'single_owner');
    }
    return data.fileConcentration.filter((f) => f.concentrationLevel !== 'single_owner');
  }, [data, ownerFilter]);

  if (loading) return <LoadingState label="Checking team commit history..." />;
  if (error) return <ErrorBanner message={error} />;
  if (!data || !data.available) {
    return (
      <div className="space-y-4">
        <SectionHeader
          title="Team Activity"
          description="See who edits which files so knowledge isn't stuck with one person."
        />
        <EmptyState
          title="Git history needed"
          description={data?.note || 'Connect a Git project to view team commits.'}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Team Activity"
        description="See who edits which files so knowledge isn't stuck with one person."
      />

      <Surface className="border-t-2 border-t-slate-400 p-4 text-xs text-slate-600 dark:border-t-slate-600 dark:text-slate-400">
        <span className="font-semibold text-slate-900 dark:text-slate-100">Note: </span>
        {data.disclaimer}
      </Surface>

      <div className="grid gap-6 lg:grid-cols-2">
        <Surface className="border-t-2 border-t-cyan-500 p-5">
          <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
            Team Commits ({data.contributors.length})
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">Developer</th>
                  <th className="py-2 pr-3 text-right font-medium">Commits</th>
                  <th className="py-2 pr-3 font-medium">Share</th>
                  <th className="py-2 pr-3 text-right font-medium">Files</th>
                  <th className="py-2 text-right font-medium">+/- Lines</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {data.contributors.map((c) => (
                  <tr key={c.author} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 pr-3">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{c.author}</div>
                      <div className="font-mono text-[11px] text-slate-500">{c.email}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono font-semibold tabular-nums">{c.commits}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                          <div
                            className="h-full bg-cyan-500"
                            style={{ width: `${Math.max(4, Math.min(100, c.sharePct))}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] tabular-nums">{c.sharePct}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{c.filesTouched}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">
                      <span className="text-emerald-600 dark:text-emerald-400">+{c.additions}</span>
                      {' / '}
                      <span className="text-rose-600 dark:text-rose-400">-{c.deletions}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>

        <Surface className="border-t-2 border-t-amber-500 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                Single-Person Files
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {data.singleOwnerFilesCount} files edited by only one person
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
              {([
                { id: 'all', label: 'All' },
                { id: 'single_owner', label: 'One Owner' },
                { id: 'shared', label: 'Shared' },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setOwnerFilter(tab.id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    ownerFilter === tab.id
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 max-h-80 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">File</th>
                  <th className="py-2 pr-3 font-medium">Main Editor</th>
                  <th className="py-2 pr-3 text-right font-medium">Share</th>
                  <th className="py-2 text-right font-medium">Ownership</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {filteredFiles.map((fc) => (
                  <tr key={fc.path} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        onClick={() => onOpenFile(fc.path)}
                        className="font-mono text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {fc.path}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{fc.topAuthor}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{fc.topAuthorSharePct}%</td>
                    <td
                      className={`py-2 text-right font-medium ${
                        fc.concentrationLevel === 'single_owner'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {fc.concentrationLevel === 'single_owner'
                        ? 'One Owner'
                        : fc.concentrationLevel === 'concentrated'
                        ? 'Mostly One'
                        : 'Shared'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      </div>
    </div>
  );
}

export function ProjectHealthPage({
  repoId,
  onOpenFile,
  onOpenExport,
  onBreadcrumbChange,
}: {
  repoId: string;
  onOpenFile: OpenFileFn;
  onOpenExport?: () => void;
  onBreadcrumbChange?: (ctx: BreadcrumbContextUpdate) => void;
}) {
  const [data, setData] = useState<ProjectHealthResult | null>(null);
  const [heatmapSort, setHeatmapSort] = useState<'avgRisk' | 'debtItems' | 'files'>('avgRisk');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'critical' | 'high'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onBreadcrumbChange?.({ segments: [], activeFilePath: null });
  }, [onBreadcrumbChange]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get<ProjectHealthResult>(`/api/repos/${repoId}/health`)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to check project health.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repoId]);

  const sortedHeatmap = useMemo(() => {
    if (!data) return [];
    return [...data.heatmap].sort((a, b) => b[heatmapSort] - a[heatmapSort]);
  }, [data, heatmapSort]);

  const filteredActions = useMemo(() => {
    if (!data) return [];
    if (priorityFilter === 'all') return data.prioritizedActions;
    return data.prioritizedActions.filter((a) => a.priority === priorityFilter);
  }, [data, priorityFilter]);

  if (loading) return <LoadingState label="Checking overall project health..." />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Health Score"
        description="Overall code grade, folder scores, and top fixes."
        actions={
          onOpenExport ? (
            <button
              type="button"
              onClick={onOpenExport}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
            >
              <Download className="h-3.5 w-3.5" />
              Export PDF / Markdown
            </button>
          ) : undefined
        }
      />

      <Surface className="overflow-hidden border-t-2 border-t-emerald-500">
        <div className="grid divide-y divide-slate-200 dark:divide-slate-800 lg:grid-cols-12 lg:divide-x lg:divide-y-0">
          <div className="flex flex-col justify-between gap-5 p-6 lg:col-span-4">
            <RadialScoreGauge
              score={data.overallScore}
              label={`Grade ${data.grade}`}
              sublabel="Overall project score"
              size={124}
            />
            <div className="border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Combines complexity, test coverage, file coupling, and cleanup checks into one score.
            </div>
          </div>

          <div className="flex items-center justify-center bg-slate-50/60 p-4 dark:bg-slate-950/50 lg:col-span-4">
            <DimensionRadarChart dimensions={data.dimensions} />
          </div>

          <div className="divide-y divide-slate-100 p-4 dark:divide-slate-800 lg:col-span-4">
            {data.dimensions.map((d) => (
              <div key={d.name} className="py-2.5 first:pt-1 last:pb-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {d.name}{' '}
                    <span className="font-mono text-[11px] text-slate-400">
                      ({Math.round(d.weight * 100)}%)
                    </span>
                  </span>
                  <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {d.score}/100
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full ${
                      d.score >= 75
                        ? 'bg-emerald-500'
                        : d.score >= 50
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.max(4, d.score)}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{d.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </Surface>

      <div className="grid gap-6 lg:grid-cols-2">
        <Surface className="border-t-2 border-t-blue-500 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
              Folder Health
            </h3>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
              {([
                { id: 'avgRisk', label: 'Risk' },
                { id: 'debtItems', label: 'Issues' },
                { id: 'files', label: 'Files' },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setHeatmapSort(tab.id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    heatmapSort === tab.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  Sort: {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">Folder</th>
                  <th className="py-2 pr-3 text-right font-medium">Files</th>
                  <th className="py-2 pr-3 text-right font-medium">Avg Risk</th>
                  <th className="py-2 pr-3 text-right font-medium">Issues</th>
                  <th className="py-2 pr-3 text-right font-medium">Tests</th>
                  <th className="py-2 text-right font-medium">Edits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {sortedHeatmap.map((row) => {
                  const riskTone =
                    row.avgRisk >= 60
                      ? 'text-rose-600 dark:text-rose-400'
                      : row.avgRisk >= 35
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400';
                  return (
                    <tr key={row.directory} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 pr-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {row.directory}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{row.files}</td>
                      <td className={`py-2.5 pr-3 text-right font-mono font-bold tabular-nums ${riskTone}`}>
                        {row.avgRisk}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{row.debtItems}</td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{row.testCoveragePct}%</td>
                      <td className="py-2.5 text-right font-mono tabular-nums">{row.churn}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>

        <Surface className="border-t-2 border-t-rose-500 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
              What to Fix Next ({filteredActions.length})
            </h3>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
              {(['all', 'critical', 'high'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setPriorityFilter(level)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${
                    priorityFilter === level
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 space-y-2.5">
            {filteredActions.map((act, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/50"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <SeverityLabel level={act.priority} />
                  <button
                    type="button"
                    onClick={() => onOpenFile(act.target.split(':')[0])}
                    className="font-mono font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {act.target}
                  </button>
                </div>
                <div className="mt-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {act.title}
                </div>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{act.rationale}</p>
              </div>
            ))}
            {filteredActions.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-500">No items match this filter.</p>
            )}
          </div>
        </Surface>
      </div>
    </div>
  );
}
