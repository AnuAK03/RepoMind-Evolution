import React, { useEffect, useState } from 'react';
import { ArrowRight, GitCommitHorizontal, GitCompare, Search } from 'lucide-react';
import { api } from '../api';
import type {
  BreadcrumbContextUpdate,
  BreadcrumbSegment,
  ChangeImpactResult,
  FileSummary,
  GitHistoryData,
  OpenFileFn,
} from '../types';
import {
  DiffViewer,
  EmptyState,
  ErrorBanner,
  LoadingState,
  SectionHeader,
  SeverityLabel,
  Surface,
} from '../components/UiPrimitives';

export function GitEvolutionPage({
  repoId,
  onOpenFile,
  onAnalyzeImpact,
  onBreadcrumbChange,
}: {
  repoId: string;
  onOpenFile: OpenFileFn;
  onAnalyzeImpact: (file: string, commit?: string) => void;
  onBreadcrumbChange?: (ctx: BreadcrumbContextUpdate) => void;
}) {
  const [git, setGit] = useState<GitHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCommitSha, setSelectedCommitSha] = useState<string>('');
  const [baseSha, setBaseSha] = useState('');
  const [headSha, setHeadSha] = useState('');
  const [diffResult, setDiffResult] = useState<{
    files: { path: string; status: string; additions: number; deletions: number }[];
    diffPreview: string;
  } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .get<GitHistoryData>(`/api/repos/${repoId}/git`)
      .then((res) => {
        if (!active) return;
        setGit(res);
        if (res.commits.length >= 1) {
          setSelectedCommitSha(res.commits[0].sha);
        }
        if (res.commits.length >= 2) {
          setHeadSha(res.commits[0].sha);
          setBaseSha(res.commits[1].sha);
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load Git history.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repoId]);

  const runDiff = async (b = baseSha, h = headSha) => {
    if (!b || !h) return;
    setDiffLoading(true);
    try {
      const res = await api.get<{
        files: { path: string; status: string; additions: number; deletions: number }[];
        diffPreview: string;
      }>(`/api/repos/${repoId}/git/diff?base=${encodeURIComponent(b)}&head=${encodeURIComponent(h)}`);
      setDiffResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Commit diff failed.');
    } finally {
      setDiffLoading(false);
    }
  };

  useEffect(() => {
    if (baseSha && headSha) {
      runDiff(baseSha, headSha);
    }
  }, [baseSha, headSha]);

  const activeCommit = git?.commits.find((c) => c.sha === selectedCommitSha) || git?.commits[0] || null;

  useEffect(() => {
    const segments: BreadcrumbSegment[] = [];
    if (git?.available) {
      segments.push({
        id: 'git-branch',
        label: git.branch,
        mono: true,
        title: `Branch ${git.branch}`,
        onClick: git.commits[0] ? () => setSelectedCommitSha(git.commits[0].sha) : undefined,
      });
      if (activeCommit) {
        segments.push({
          id: `commit-${activeCommit.shortSha}`,
          label: `${activeCommit.shortSha} · ${activeCommit.subject.slice(0, 34)}`,
          mono: true,
          title: `${activeCommit.sha} — ${activeCommit.subject}`,
        });
      }
    }
    onBreadcrumbChange?.({
      segments,
      activeFilePath: null,
      onResetView: () => {
        if (git?.commits[0]) {
          setSelectedCommitSha(git.commits[0].sha);
        }
      },
    });
  }, [git, activeCommit, onBreadcrumbChange]);

  if (loading) return <LoadingState label="Reading Git commit graph and churn metrics..." />;
  if (error) return <ErrorBanner message={error} />;
  if (!git || !git.available) {
    return (
      <div className="space-y-4">
        <SectionHeader
          title="Git History"
          description="Commit timeline, code churn hotspots, and commit-to-commit diff inspection."
        />
        <EmptyState
          title="No Git history in workspace"
          description={
            git?.note ||
            'This repository was uploaded as a ZIP archive without .git metadata. Connect an HTTPS Git repository to inspect commit history.'
          }
        />
      </div>
    );
  }

  const maxTimelineChurn = Math.max(1, ...git.timeline.map((t) => t.additions + t.deletions));
  const selectedCommit = git.commits.find((c) => c.sha === selectedCommitSha) || git.commits[0];

  const inspectCommitParentDiff = (idx: number) => {
    const cur = git.commits[idx];
    const parent = git.commits[idx + 1];
    if (!cur) return;
    setSelectedCommitSha(cur.sha);
    if (parent) {
      setBaseSha(parent.sha);
      setHeadSha(cur.sha);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Commit History"
        description={`Branch ${git.branch} · ${git.totalCommits} commits loaded in ${git.extractionMs} ms`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Surface className="border-t-2 border-t-teal-500 p-4">
          <div className="text-xs text-slate-500">Total Commits</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-teal-600 dark:text-teal-400">
            {git.totalCommits}
          </div>
          <div className="mt-1 font-mono text-[11px] text-slate-500">Branch {git.branch}</div>
        </Surface>
        <Surface className="border-t-2 border-t-amber-500 p-4">
          <div className="text-xs text-slate-500">Edited Files</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {git.fileChurn.length}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Files changed over time</div>
        </Surface>
        <Surface className="border-t-2 border-t-emerald-500 p-4">
          <div className="text-xs text-slate-500">Lines Added</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            +{git.commits.reduce((s, c) => s + c.additions, 0).toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">New code written</div>
        </Surface>
        <Surface className="border-t-2 border-t-rose-500 p-4">
          <div className="text-xs text-slate-500">Lines Removed</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
            -{git.commits.reduce((s, c) => s + c.deletions, 0).toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Code deleted</div>
        </Surface>
      </div>

      {/* Commit Log + Commit Inspector Split */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Surface className="p-4 lg:col-span-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Commit Log</h3>
          <div className="mt-3 max-h-[26rem] space-y-2 overflow-auto pr-1">
            {git.commits.map((c, idx) => {
              const active = selectedCommit?.sha === c.sha;
              return (
                <button
                  key={c.sha}
                  type="button"
                  onClick={() => inspectCommitParentDiff(idx)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    active
                      ? 'border-teal-500 bg-teal-50/60 dark:bg-teal-950/40'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                      <GitCommitHorizontal className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                      {c.shortSha}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-slate-500">
                      {c.date.slice(0, 10)} · +{c.additions}/-{c.deletions}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-200">
                    {c.subject}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {c.author} · {c.files.length} changed file(s)
                  </div>
                </button>
              );
            })}
          </div>
        </Surface>

        <Surface className="p-4 lg:col-span-7">
          {selectedCommit && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                <div>
                  <div className="font-mono text-xs text-slate-500">{selectedCommit.sha}</div>
                  <h3 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {selectedCommit.subject}
                  </h3>
                  <div className="mt-1 text-xs text-slate-500">
                    {selectedCommit.author} ({selectedCommit.email}) · {selectedCommit.date.slice(0, 19).replace('T', ' ')}
                  </div>
                </div>
                {selectedCommit.files[0] && (
                  <button
                    type="button"
                    onClick={() => onAnalyzeImpact(selectedCommit.files[0].path, selectedCommit.shortSha)}
                    className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
                  >
                    Trace Commit Impact
                  </button>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Changed Files ({selectedCommit.files.length})
                </div>
                <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800/70">
                  {selectedCommit.files.map((f) => (
                    <div key={f.path} className="flex items-center justify-between py-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => onOpenFile(f.path)}
                        className="font-mono text-teal-600 hover:underline dark:text-teal-400"
                      >
                        {f.path}
                      </button>
                      <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums">
                        <span className="text-emerald-600 dark:text-emerald-400">+{f.additions}</span>
                        <span className="text-red-600 dark:text-red-400">-{f.deletions}</span>
                        <button
                          type="button"
                          onClick={() => onAnalyzeImpact(f.path, selectedCommit.shortSha)}
                          className="font-sans text-xs text-slate-500 hover:text-teal-600"
                        >
                          Impact
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Surface>
      </div>

      {git.commits.length >= 2 && (
        <Surface className="border-t-2 border-t-teal-500 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <GitCompare className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              Code Changes (Diff)
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={baseSha}
                onChange={(e) => setBaseSha(e.target.value)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                {git.commits.map((c) => (
                  <option key={c.sha} value={c.sha}>
                    {c.shortSha} — {c.subject.slice(0, 38)}
                  </option>
                ))}
              </select>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={headSha}
                onChange={(e) => setHeadSha(e.target.value)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                {git.commits.map((c) => (
                  <option key={c.sha} value={c.sha}>
                    {c.shortSha} — {c.subject.slice(0, 38)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            {diffLoading && <LoadingState label="Computing unified diff..." />}
            {!diffLoading && diffResult && (
              <DiffViewer diffText={diffResult.diffPreview || 'No textual diff between selected commits.'} />
            )}
          </div>
        </Surface>
      )}

      {/* Churn Hotspots & Timeline */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Surface className="border-t-2 border-t-amber-500 p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Most Edited Files
          </h3>
          <div className="mt-3 max-h-72 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                  <th className="py-2 pr-3 font-medium">File</th>
                  <th className="py-2 pr-3 text-right font-medium">Commits</th>
                  <th className="py-2 pr-3 text-right font-medium">Changes</th>
                  <th className="py-2 text-right font-medium">Check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {git.fileChurn.slice(0, 15).map((f) => (
                  <tr key={f.path} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        onClick={() => onOpenFile(f.path)}
                        className="font-mono text-teal-600 hover:underline dark:text-teal-400"
                      >
                        {f.path}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{f.commits}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">
                      <span className="text-emerald-600 dark:text-emerald-400">+{f.additions}</span>{' '}
                      <span className="text-rose-600 dark:text-rose-400">-{f.deletions}</span>
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onAnalyzeImpact(f.path)}
                        className="text-xs font-medium text-teal-600 hover:underline dark:text-teal-400"
                      >
                        Impact
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>

        {git.timeline.length > 0 && (
          <Surface className="border-t-2 border-t-emerald-500 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Changes Over Time
              </h3>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-[2px] bg-emerald-500" />
                  Added
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-[2px] bg-rose-500" />
                  Removed
                </span>
              </div>
            </div>
            <div className="mt-4 flex items-end gap-2 overflow-x-auto pb-2" style={{ minHeight: '165px' }}>
              {git.timeline.map((pt) => {
                const churn = pt.additions + pt.deletions;
                const hPct = Math.max(10, Math.round((churn / maxTimelineChurn) * 100));
                const addRatio = churn > 0 ? Math.round((pt.additions / churn) * 100) : 100;
                const delRatio = 100 - addRatio;
                return (
                  <div key={pt.date} className="flex min-w-[64px] flex-1 flex-col items-center gap-1.5">
                    <div className="font-mono text-[11px] tabular-nums text-slate-500">
                      <span className="text-emerald-700 dark:text-emerald-400">+{pt.additions}</span>
                      {' / '}
                      <span className="text-rose-600 dark:text-rose-400">-{pt.deletions}</span>
                    </div>
                    <div
                      className="flex h-28 w-full max-w-[44px] items-end rounded bg-slate-100 p-1 dark:bg-slate-800"
                      title={`${pt.date}: ${pt.commits} commit(s), +${pt.additions} / -${pt.deletions}`}
                    >
                      <div
                        className="flex w-full flex-col overflow-hidden rounded-sm"
                        style={{ height: `${hPct}%` }}
                      >
                        {delRatio > 0 && (
                          <div className="w-full bg-rose-500" style={{ height: `${delRatio}%` }} />
                        )}
                        {addRatio > 0 && (
                          <div className="w-full bg-emerald-600" style={{ height: `${addRatio}%` }} />
                        )}
                      </div>
                    </div>
                    <div className="font-mono text-[10px] tabular-nums text-slate-500">{pt.date}</div>
                  </div>
                );
              })}
            </div>
          </Surface>
        )}
      </div>
    </div>
  );
}

export function ChangeImpactPage({
  repoId,
  initialTarget,
  onOpenFile,
  onBreadcrumbChange,
}: {
  repoId: string;
  initialTarget: { file?: string; commit?: string } | null;
  onOpenFile: OpenFileFn;
  onBreadcrumbChange?: (ctx: BreadcrumbContextUpdate) => void;
}) {
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [selectedFile, setSelectedFile] = useState(initialTarget?.file || '');
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [hopFilter, setHopFilter] = useState<'all' | 'direct' | 'transitive'>('all');
  const [impact, setImpact] = useState<ChangeImpactResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialTarget?.file) {
      setSelectedFile(initialTarget.file);
      setSelectedSymbol('');
    }
  }, [initialTarget]);

  useEffect(() => {
    api
      .get<{ files: FileSummary[] }>(`/api/repos/${repoId}/overview`)
      .then((res) => {
        const codeFiles = res.files.filter((f) => !f.isTest);
        setFiles(codeFiles);
        if (!selectedFile && codeFiles[0]) {
          const preferred =
            codeFiles.find((f) => f.path.includes('authentication')) ||
            codeFiles.find((f) => f.path.includes('service')) ||
            codeFiles[0];
          setSelectedFile(preferred.path);
        }
      })
      .catch(() => {});
  }, [repoId]);

  useEffect(() => {
    if (!selectedFile) return;
    let active = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ file: selectedFile });
    if (selectedSymbol) params.set('symbol', selectedSymbol);
    if (initialTarget?.commit) params.set('commit', initialTarget.commit);

    api
      .get<ChangeImpactResult>(`/api/repos/${repoId}/impact?${params.toString()}`)
      .then((res) => {
        if (active) setImpact(res);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Impact analysis failed.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repoId, selectedFile, selectedSymbol, initialTarget?.commit]);

  useEffect(() => {
    const segments: BreadcrumbSegment[] = [];
    if (selectedFile) {
      segments.push({
        id: `impact-file-${selectedFile}`,
        label: selectedFile,
        mono: true,
        title: selectedFile,
        onClick: selectedSymbol ? () => setSelectedSymbol('') : undefined,
      });
      if (initialTarget?.commit) {
        segments.push({
          id: `impact-commit-${initialTarget.commit}`,
          label: `@${initialTarget.commit}`,
          mono: true,
          title: `Commit ${initialTarget.commit}`,
        });
      }
      if (selectedSymbol) {
        segments.push({
          id: `impact-sym-${selectedSymbol}`,
          label: selectedSymbol,
          mono: true,
        });
      }
    }
    onBreadcrumbChange?.({
      segments,
      activeFilePath: selectedFile || null,
      onResetView: () => setSelectedSymbol(''),
    });
  }, [selectedFile, selectedSymbol, initialTarget?.commit, onBreadcrumbChange]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="What Breaks?"
        description="Pick a file to see which other files, APIs, and tests depend on it."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={selectedFile}
              onChange={(e) => {
                setSelectedFile(e.target.value);
                setSelectedSymbol('');
              }}
              className="max-w-xs rounded-md border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {files.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.path}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {loading && <LoadingState label="Tracing connected files..." />}
      {error && <ErrorBanner message={error} />}

      {impact && !loading && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Surface className="border-t-2 border-t-teal-500 p-4">
              <div className="text-xs text-slate-500">Direct Links</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-teal-600 dark:text-teal-400">
                {impact.directCount}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Files importing this</div>
            </Surface>
            <Surface className="border-t-2 border-t-amber-500 p-4">
              <div className="text-xs text-slate-500">Chain Effect</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {impact.transitiveCount}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">2+ steps away</div>
            </Surface>
            <Surface className="border-t-2 border-t-rose-500 p-4">
              <div className="text-xs text-slate-500">Total Reach</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
                {impact.blastRadiusPct}%
              </div>
              <div className="mt-1 text-[11px] text-slate-500">{impact.totalAffected} files touched</div>
            </Surface>
            <Surface className="border-t-2 border-t-cyan-500 p-4">
              <div className="text-xs text-slate-500">Affected APIs</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-cyan-600 dark:text-cyan-400">
                {impact.affectedApis.length}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Web endpoints</div>
            </Surface>
            <Surface className="border-t-2 border-t-emerald-500 p-4">
              <div className="text-xs text-slate-500">Linked Tests</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {impact.associatedTests.length}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Done in {impact.processingMs} ms</div>
            </Surface>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Surface className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Files That Depend On It
                </h3>
                <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5 dark:bg-slate-800/80">
                  {(
                    [
                      ['all', 'All'],
                      ['direct', `Direct (${impact.directCount})`],
                      ['transitive', `Chain (${impact.transitiveCount})`],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setHopFilter(val)}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
                        hopFilter === val
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {impact.directDependents.length === 0 && impact.transitiveDependents.length === 0 ? (
                <p className="mt-4 text-xs text-slate-500">
                  No other code files import {impact.targetFile}.
                </p>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {(hopFilter === 'direct'
                    ? impact.directDependents
                    : hopFilter === 'transitive'
                    ? impact.transitiveDependents
                    : [...impact.directDependents, ...impact.transitiveDependents]
                  ).map((item) => (
                    <div key={item.path} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenFile(item.path)}
                          className="font-mono text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
                        >
                          {item.path}
                        </button>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>{item.impactType === 'direct' ? 'Direct · Step 1' : `Chain · Step ${item.depth}`}</span>
                          <span aria-hidden="true">·</span>
                          <SeverityLabel level={item.severity} />
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{item.reason}</p>
                      <div className="mt-2 font-mono text-[11px] text-slate-500">
                        {item.impactPath.join(' → ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Surface>

            <div className="space-y-6">
              <Surface className="p-5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Affected APIs
                </h3>
                {impact.affectedApis.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">No API routes found on this chain.</p>
                ) : (
                  <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                    {impact.affectedApis.map((ep) => (
                      <div key={`${ep.file}:${ep.route}:${ep.line}`} className="flex items-center justify-between py-2 text-xs">
                        <div>
                          <span className="font-mono font-semibold text-slate-900 dark:text-white">
                            {ep.method} {ep.route}
                          </span>
                          <div className="mt-0.5">
                            <button
                              type="button"
                              onClick={() => onOpenFile(ep.file, ep.line)}
                              className="font-mono text-[11px] text-teal-600 hover:underline dark:text-teal-400"
                            >
                              {ep.file}:{ep.line}
                            </button>
                          </div>
                        </div>
                        <span className="text-slate-500">Step {ep.hop}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Surface>

              <Surface className="p-5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Tests &amp; Functions
                </h3>
                <div className="mt-3 space-y-2">
                  {impact.associatedTests.length === 0 ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      No static test mapping found for this module or its dependents.
                    </p>
                  ) : (
                    impact.associatedTests.map((t) => (
                      <div
                        key={t.path}
                        className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-xs dark:border-slate-800"
                      >
                        <div>
                          <button
                            type="button"
                            onClick={() => onOpenFile(t.path)}
                            className="font-mono font-medium text-teal-600 hover:underline dark:text-teal-400"
                          >
                            {t.path}
                          </button>
                          <div className="text-[11px] text-slate-500">{t.reason}</div>
                        </div>
                        <span className="font-mono tabular-nums text-slate-500">{t.cases} cases</span>
                      </div>
                    ))
                  )}
                </div>

                {impact.changedSymbols.length > 0 && (
                  <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                      <span>Symbols in {impact.targetFile}</span>
                      {selectedSymbol && (
                        <button
                          type="button"
                          onClick={() => setSelectedSymbol('')}
                          className="text-teal-600 hover:underline"
                        >
                          Clear filter
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {impact.changedSymbols.map((s) => (
                        <button
                          key={`${s.name}:${s.line}`}
                          type="button"
                          onClick={() => onOpenFile(impact.targetFile, s.line)}
                          className="rounded border border-slate-200 px-2 py-1 font-mono text-[11px] text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:text-slate-300"
                        >
                          {s.name} · L{s.line} · CC {s.complexity}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Surface>
            </div>
          </div>

          <Surface className="p-4 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200">Static Analysis Boundary: </span>
            {impact.limitationsNote}
          </Surface>
        </>
      )}
    </div>
  );
}
