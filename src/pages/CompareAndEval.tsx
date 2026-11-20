import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Copy, Download, Play } from 'lucide-react';
import { api } from '../api';
import type {
  BreadcrumbContextUpdate,
  BreadcrumbSegment,
  GitHistoryData,
  RepoComparisonResult,
  RepoMeta,
  ResearchEvaluationResult,
  StakeholderExportPayload,
} from '../types';
import { downloadMarkdownFile, exportStakeholderPdf } from '../utils/exportReport';
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  SectionHeader,
  Surface,
} from '../components/UiPrimitives';

export function ComparativeAnalysisPage({
  repoId,
  repositories,
  onBreadcrumbChange,
}: {
  repoId: string;
  repositories: RepoMeta[];
  onBreadcrumbChange?: (ctx: BreadcrumbContextUpdate) => void;
}) {
  const [mode, setMode] = useState<'git_refs' | 'repositories'>('git_refs');
  const [git, setGit] = useState<GitHistoryData | null>(null);
  const [leftRef, setLeftRef] = useState('');
  const [rightRef, setRightRef] = useState('');
  const [otherRepoId, setOtherRepoId] = useState('');
  const [result, setResult] = useState<RepoComparisonResult | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'added' | 'modified' | 'removed'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<GitHistoryData>(`/api/repos/${repoId}/git`)
      .then((g) => {
        setGit(g);
        if (g.available && g.commits.length >= 2) {
          setLeftRef(g.commits[g.commits.length - 1].sha);
          setRightRef(g.commits[0].sha);
        } else if (repositories.length > 1) {
          setMode('repositories');
        }
      })
      .catch(() => {});

    const others = repositories.filter((r) => r.id !== repoId);
    if (others[0]) setOtherRepoId(others[0].id);
  }, [repoId, repositories]);

  const runCompare = async () => {
    setLoading(true);
    setError(null);
    try {
      const url =
        mode === 'git_refs'
          ? `/api/repos/${repoId}/compare?mode=git_refs&left=${encodeURIComponent(leftRef)}&right=${encodeURIComponent(rightRef)}`
          : `/api/repos/${repoId}/compare?mode=repositories&otherId=${encodeURIComponent(otherRepoId)}`;
      const res = await api.get<RepoComparisonResult>(url);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Comparison failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const segments: BreadcrumbSegment[] = [
      {
        id: `compare-mode-${mode}`,
        label: mode === 'git_refs' ? 'Commits' : 'Projects',
        onClick: result ? () => setResult(null) : undefined,
      },
    ];
    if (result) {
      segments.push({
        id: 'compare-result',
        label: `${result.leftLabel.slice(0, 14)} vs ${result.rightLabel.slice(0, 14)}`,
        mono: true,
      });
    }
    onBreadcrumbChange?.({
      segments,
      activeFilePath: null,
      onResetView: () => setResult(null),
    });
  }, [mode, result, onBreadcrumbChange]);

  const filteredFileChanges = useMemo(() => {
    if (!result) return [];
    if (statusFilter === 'all') return result.fileChanges;
    return result.fileChanges.filter((fc) => fc.status.toLowerCase() === statusFilter);
  }, [result, statusFilter]);

  const otherRepos = repositories.filter((r) => r.id !== repoId);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Compare"
        description="See what changed between two commits or two projects."
      />

      <Surface className="border-t-2 border-t-indigo-500 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setMode('git_refs')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                mode === 'git_refs'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Two Commits
            </button>
            <button
              type="button"
              onClick={() => setMode('repositories')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                mode === 'repositories'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Two Projects
            </button>
          </div>

          <button
            type="button"
            onClick={runCompare}
            disabled={
              loading ||
              (mode === 'git_refs' && (!git?.available || !leftRef || !rightRef)) ||
              (mode === 'repositories' && !otherRepoId)
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {loading ? 'Comparing...' : 'Compare Now'}
          </button>
        </div>

        <div className="mt-4">
          {mode === 'git_refs' ? (
            git?.available && git.commits.length >= 2 ? (
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={leftRef}
                  onChange={(e) => setLeftRef(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                >
                  {git.commits.map((c) => (
                    <option key={c.sha} value={c.sha}>
                      Old: {c.shortSha} ({c.date.slice(0, 10)}) — {c.subject.slice(0, 35)}
                    </option>
                  ))}
                </select>
                <ArrowRight className="h-4 w-4 text-slate-400" />
                <select
                  value={rightRef}
                  onChange={(e) => setRightRef(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                >
                  {git.commits.map((c) => (
                    <option key={c.sha} value={c.sha}>
                      New: {c.shortSha} ({c.date.slice(0, 10)}) — {c.subject.slice(0, 35)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                At least 2 saved commits are needed to compare versions.
              </p>
            )
          ) : otherRepos.length > 0 ? (
            <select
              value={otherRepoId}
              onChange={(e) => setOtherRepoId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
            >
              {otherRepos.map((r) => (
                <option key={r.id} value={r.id}>
                  Compare with: {r.name} ({r.totalFiles} files)
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-slate-500">
              Add a second project from Overview to compare two projects.
            </p>
          )}
        </div>
      </Surface>

      {error && <ErrorBanner message={error} />}
      {loading && <LoadingState label="Comparing both snapshots..." />}

      {result && !loading && (
        <div className="space-y-6">
          <Surface className="border-t-2 border-t-blue-500 p-5">
            <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">Score Changes</h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{result.summary}</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2 pr-4 font-medium">Metric</th>
                    <th className="py-2 pr-4 text-right font-mono font-medium">{result.leftLabel.slice(0, 18)}</th>
                    <th className="py-2 pr-4 text-right font-mono font-medium">{result.rightLabel.slice(0, 18)}</th>
                    <th className="py-2 text-right font-medium">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {result.metrics.map((m) => {
                    const deltaStr = String(m.delta);
                    const deltaTone = deltaStr.startsWith('+')
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : deltaStr.startsWith('-')
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-blue-600 dark:text-blue-400';
                    return (
                      <tr key={m.metric} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 pr-4 font-medium text-slate-800 dark:text-slate-200">{m.metric}</td>
                        <td className="py-2.5 pr-4 text-right font-mono tabular-nums">{m.leftValue}</td>
                        <td className="py-2.5 pr-4 text-right font-mono tabular-nums">{m.rightValue}</td>
                        <td className={`py-2.5 text-right font-mono font-bold tabular-nums ${deltaTone}`}>
                          {m.delta}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Surface>

          <Surface className="border-t-2 border-t-cyan-500 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                Changed Files ({filteredFileChanges.length})
              </h3>
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
                {(['all', 'added', 'modified', 'removed'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${
                      statusFilter === st
                        ? 'bg-cyan-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 max-h-72 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2 pr-4 font-medium">File</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 text-right font-medium">Lines Changed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {filteredFileChanges.map((fc) => (
                    <tr key={fc.path} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 pr-4 font-mono">{fc.path}</td>
                      <td className="py-2 pr-4 capitalize text-slate-600 dark:text-slate-400">{fc.status}</td>
                      <td
                        className={`py-2 text-right font-mono font-semibold tabular-nums ${
                          fc.linesDelta > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : fc.linesDelta < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {fc.linesDelta >= 0 ? `+${fc.linesDelta}` : fc.linesDelta}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>
        </div>
      )}
    </div>
  );
}

export function ResearchAndReportsPage({
  repoId,
  onBreadcrumbChange,
}: {
  repoId: string;
  onBreadcrumbChange?: (ctx: BreadcrumbContextUpdate) => void;
}) {
  const [evalData, setEvalData] = useState<ResearchEvaluationResult | null>(null);
  const [markdown, setMarkdown] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onBreadcrumbChange?.({ segments: [], activeFilePath: null });
  }, [onBreadcrumbChange]);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ev, md] = await Promise.all([
        api.get<ResearchEvaluationResult>(`/api/repos/${repoId}/evaluation`),
        api.get<{ markdown: string }>(`/api/repos/${repoId}/report?format=markdown`),
      ]);
      setEvalData(ev);
      setMarkdown(md.markdown);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [repoId]);

  const downloadText = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [exportingPdf, setExportingPdf] = useState(false);

  const exportJson = async () => {
    const data = await api.get<unknown>(`/api/repos/${repoId}/report?format=json`);
    downloadText(`${repoId}-intelligence-report.json`, JSON.stringify(data, null, 2), 'application/json');
  };

  const exportPdf = async () => {
    setExportingPdf(true);
    try {
      const payload = await api.get<StakeholderExportPayload>(`/api/repos/${repoId}/report?format=stakeholder`);
      exportStakeholderPdf(payload);
    } finally {
      setExportingPdf(false);
    }
  };

  const exportCsv = () => {
    window.location.href = `/api/repos/${repoId}/report?format=csv`;
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable in sandboxed iframe
    }
  };

  if (loading) return <LoadingState label="Running checks and preparing report..." />;
  if (error) return <ErrorBanner message={error} onRetry={loadAll} />;
  if (!evalData) return <EmptyState title="No report ready" description="Try reloading this page." />;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Reports & Speed"
        description="Check scan accuracy, speed, and download stakeholder reports."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportPdf}
              disabled={exportingPdf}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {exportingPdf ? 'Building PDF...' : 'Export PDF'}
            </button>
            <button
              type="button"
              onClick={() => downloadMarkdownFile(`${repoId}-stakeholder-summary.md`, markdown)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <Download className="h-3.5 w-3.5" />
              Export Markdown
            </button>
            <button
              type="button"
              onClick={exportJson}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <Download className="h-3.5 w-3.5" />
              Export JSON
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <Download className="h-3.5 w-3.5" />
              Export Risk CSV
            </button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Surface className="border-t-2 border-t-blue-500 p-5">
          <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
            Git Check
          </h3>
          {!evalData.experiment1GitAccuracy.available ? (
            <p className="mt-3 text-xs text-slate-500">{evalData.experiment1GitAccuracy.note}</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="text-slate-500 dark:text-slate-400">Commit Match</div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">
                  {evalData.experiment1GitAccuracy.commitMatchPct}%
                </div>
                <div className="text-[11px] text-slate-500">
                  {evalData.experiment1GitAccuracy.parsedCommitCount} / {evalData.experiment1GitAccuracy.cliCommitCount} commits
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="text-slate-500 dark:text-slate-400">File Changes</div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums">
                  {evalData.experiment1GitAccuracy.parsedFileOpsCount} / {evalData.experiment1GitAccuracy.cliFileOpsCount}
                </div>
                <div className="text-[11px] text-slate-500">
                  +{evalData.experiment1GitAccuracy.additionsParsed}/-{evalData.experiment1GitAccuracy.deletionsParsed} lines
                </div>
              </div>
            </div>
          )}
        </Surface>

        <Surface className="border-t-2 border-t-emerald-500 p-5">
          <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
            Scan Speed
          </h3>
          <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="text-slate-500 dark:text-slate-400">Code Scan</div>
              <div className="mt-1 font-mono text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {evalData.experiment5Performance.scanAndAstMs} ms
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="text-slate-500 dark:text-slate-400">Git Log</div>
              <div className="mt-1 font-mono text-base font-bold tabular-nums">
                {evalData.experiment5Performance.gitExtractionMs} ms
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="text-slate-500 dark:text-slate-400">Memory</div>
              <div className="mt-1 font-mono text-base font-bold tabular-nums">
                {evalData.experiment5Performance.heapUsedMb} MB
              </div>
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {evalData.experiment5Performance.totalFiles} files · {evalData.experiment5Performance.totalLines.toLocaleString()} lines ·{' '}
            {evalData.experiment5Performance.totalCommits} commits · {evalData.experiment5Performance.dependencyEdges} links
          </div>
        </Surface>

        <Surface className="border-t-2 border-t-indigo-500 p-5">
          <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
            Impact Check
          </h3>
          <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="text-slate-500 dark:text-slate-400">Avg Direct</div>
              <div className="mt-1 font-mono text-base font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
                {evalData.experiment2ImpactAnalysis.avgDirectImpacted}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="text-slate-500 dark:text-slate-400">Avg Chain</div>
              <div className="mt-1 font-mono text-base font-bold tabular-nums">
                {evalData.experiment2ImpactAnalysis.avgTransitiveImpacted}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="text-slate-500 dark:text-slate-400">Speed</div>
              <div className="mt-1 font-mono text-base font-bold tabular-nums">
                {evalData.experiment2ImpactAnalysis.avgProcessingMs} ms
              </div>
            </div>
          </div>
          <div className="mt-3 max-h-48 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-1.5 pr-3 font-medium">Sample File</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Direct</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Chain</th>
                  <th className="py-1.5 text-right font-medium">Tests</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {evalData.experiment2ImpactAnalysis.samples.map((s) => (
                  <tr key={s.file}>
                    <td className="py-1.5 pr-3 font-mono">{s.file}</td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{s.direct}</td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{s.transitive}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{s.testsMatched}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>

        <Surface className="border-t-2 border-t-amber-500 p-5">
          <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
            Risk & Test Check
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="text-slate-500 dark:text-slate-400">Rank Match (Complexity)</div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {evalData.experiment3RiskPrioritisation.spearmanVsComplexity}
              </div>
              <div className="text-[11px] text-slate-500">
                Top-5 match: {evalData.experiment3RiskPrioritisation.top5OverlapWithComplexity}/5
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="text-slate-500 dark:text-slate-400">Tests Skipped</div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {evalData.experiment4TestImpact.avgReductionPct}%
              </div>
              <div className="text-[11px] text-slate-500">
                Avg {evalData.experiment4TestImpact.avgRecommendedTests} of {evalData.experiment4TestImpact.totalTestFiles} suites
              </div>
            </div>
          </div>
          {evalData.experiment3RiskPrioritisation.spearmanVsChurn !== null && (
            <div className="mt-3 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              Rank match (Most Edited):{' '}
              <span className="font-mono font-semibold">{evalData.experiment3RiskPrioritisation.spearmanVsChurn}</span>{' '}
              (Top-5 match: {evalData.experiment3RiskPrioritisation.top5OverlapWithChurn}/5)
            </div>
          )}
        </Surface>
      </div>

      <Surface className="border-t-2 border-t-cyan-500 p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
            Report Preview
          </h3>
          <button
            type="button"
            onClick={copyMarkdown}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy Text'}
          </button>
        </div>
        <pre className="mt-3 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-5 text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
          {markdown}
        </pre>
      </Surface>
    </div>
  );
}
