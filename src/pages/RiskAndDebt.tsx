import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type {
  BreadcrumbContextUpdate,
  BreadcrumbSegment,
  FileRiskScore,
  OpenFileFn,
  RiskSummaryResult,
  TechnicalDebtResult,
} from '../types';
import {
  ErrorBanner,
  LoadingState,
  SearchInput,
  SectionHeader,
  SeverityLabel,
  Surface,
} from '../components/UiPrimitives';
import { RiskScatterChart } from '../components/VisualCharts';

export function RiskIntelligencePage({
  repoId,
  onOpenFile,
  onBreadcrumbChange,
}: {
  repoId: string;
  onOpenFile: OpenFileFn;
  onBreadcrumbChange?: (ctx: BreadcrumbContextUpdate) => void;
}) {
  const [data, setData] = useState<RiskSummaryResult | null>(null);
  const [selected, setSelected] = useState<FileRiskScore | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .get<RiskSummaryResult>(`/api/repos/${repoId}/risk`)
      .then((res) => {
        if (!active) return;
        setData(res);
        setSelected(res.files[0] || null);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Risk check failed.');
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
    const q = search.trim().toLowerCase();
    return data.files.filter((f) => {
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
      if (q && !f.path.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, categoryFilter]);

  useEffect(() => {
    const segments: BreadcrumbSegment[] = [];
    if (selected) {
      segments.push({
        id: `risk-file-${selected.path}`,
        label: selected.path,
        mono: true,
        title: `${selected.path} — Risk ${selected.score}/100`,
      });
    }
    onBreadcrumbChange?.({
      segments,
      activeFilePath: selected?.path || null,
      onResetView: () => {
        setSearch('');
        setCategoryFilter('all');
        if (data?.files[0]) setSelected(data.files[0]);
      },
    });
  }, [selected, data, onBreadcrumbChange]);

  if (loading) return <LoadingState label="Checking file risks..." />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Risk Check"
        description="Shows which files are hardest to edit safely and the exact reasons why."
      />

      <Surface className="overflow-hidden border-t-2 border-t-rose-500">
        <div className="grid divide-y divide-slate-200 dark:divide-slate-800 sm:grid-cols-5 sm:divide-x sm:divide-y-0">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`p-4 text-left transition-colors ${
              categoryFilter === 'all' ? 'bg-blue-50/70 dark:bg-blue-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <div className="text-xs text-slate-500">Average Score</div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {data.averageScore}
              <span className="text-xs font-normal text-slate-400">/100</span>
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">{data.files.length} files · Show all</div>
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter(categoryFilter === 'critical' ? 'all' : 'critical')}
            className={`p-4 text-left transition-colors ${
              categoryFilter === 'critical' ? 'bg-rose-50 dark:bg-rose-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <div className="text-xs text-slate-500">Critical (72+)</div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {data.distribution.critical}
            </div>
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter(categoryFilter === 'high' ? 'all' : 'high')}
            className={`p-4 text-left transition-colors ${
              categoryFilter === 'high' ? 'bg-orange-50 dark:bg-orange-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <div className="text-xs text-slate-500">High (52–71)</div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-orange-600 dark:text-orange-400">
              {data.distribution.high}
            </div>
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter(categoryFilter === 'medium' ? 'all' : 'medium')}
            className={`p-4 text-left transition-colors ${
              categoryFilter === 'medium' ? 'bg-amber-50 dark:bg-amber-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <div className="text-xs text-slate-500">Medium (32–51)</div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {data.distribution.medium}
            </div>
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter(categoryFilter === 'low' ? 'all' : 'low')}
            className={`p-4 text-left transition-colors ${
              categoryFilter === 'low' ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <div className="text-xs text-slate-500">Safe (&lt;32)</div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {data.distribution.low}
            </div>
          </button>
        </div>
        <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs dark:border-slate-800 dark:bg-slate-950/50">
          <span className="font-semibold text-slate-800 dark:text-slate-200">How it scores: </span>
          <span className="font-mono text-[11px] text-indigo-700 dark:text-indigo-400">
            {data.formulaDescription}
          </span>
        </div>
      </Surface>

      <Surface className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Risk Map
            </h3>
            <p className="text-xs text-slate-500">
              Click any bubble to inspect its breakdown on the right
            </p>
          </div>
          {data.assumptions[0] && (
            <span className="text-[11px] text-slate-500">{data.assumptions[0]}</span>
          )}
        </div>
        <RiskScatterChart
          files={data.files}
          selectedPath={selected?.path}
          onSelectFile={(f) => setSelected(f)}
        />
      </Surface>

      <div className="grid gap-6 lg:grid-cols-12">
        <Surface className="p-5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Files by Risk ({filteredFiles.length})
            </h3>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Filter files..."
              className="w-52"
            />
          </div>
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-white dark:bg-slate-900">
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                  <th className="py-2 pr-3 font-medium">Rank</th>
                  <th className="py-2 pr-3 font-medium">File</th>
                  <th className="py-2 pr-3 text-right font-medium">Score</th>
                  <th className="py-2 pr-3 font-medium">Level</th>
                  <th className="py-2 pr-3 text-right font-medium">CC Rank</th>
                  <th className="py-2 text-right font-medium">Churn Rank</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {filteredFiles.map((f) => {
                  const active = selected?.path === f.path;
                  return (
                    <tr
                      key={f.path}
                      onClick={() => setSelected(f)}
                      className={`cursor-pointer transition-colors ${
                        active
                          ? 'bg-blue-50/70 dark:bg-blue-950/40'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-500">#{f.integratedRank}</td>
                      <td className="py-2.5 pr-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                        {f.path}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono font-semibold tabular-nums">{f.score}</td>
                      <td className="py-2.5 pr-3">
                        <SeverityLabel level={f.category} />
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-500">
                        #{f.complexityRank}
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-slate-500">
                        {f.churnRank ? `#${f.churnRank}` : 'N/A'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>

        <div className="space-y-6 lg:col-span-5">
          {selected && (
            <Surface className="border-t-2 border-t-blue-500 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-slate-500">Why It's Risky</div>
                  <button
                    type="button"
                    onClick={() => onOpenFile(selected.path)}
                    className="mt-0.5 font-mono text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {selected.path}
                  </button>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {selected.score}/100
                  </div>
                  <SeverityLabel level={selected.category} />
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{selected.explanation}</p>

              <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                {selected.factors.map((fac) => {
                  const barTone =
                    fac.normalized >= 70
                      ? 'bg-rose-500'
                      : fac.normalized >= 40
                      ? 'bg-amber-500'
                      : 'bg-blue-500';
                  return (
                    <div key={fac.name}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {fac.name} ({Math.round(fac.weight * 100)}%)
                        </span>
                        <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          +{fac.contribution} pts ({fac.normalized}/100)
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={`h-full ${barTone}`}
                          style={{ width: `${Math.max(2, fac.normalized)}%` }}
                        />
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{fac.detail}</div>
                    </div>
                  );
                })}
              </div>
            </Surface>
          )}

          <Surface className="p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Risk by Folder
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500">Click a folder to filter files</p>
            <div className="mt-3 space-y-1.5">
              {data.directoryHotspots.map((d) => (
                <button
                  key={d.directory}
                  type="button"
                  onClick={() => setSearch(d.directory === 'root' ? '' : d.directory)}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/70"
                >
                  <span className="font-mono text-blue-600 dark:text-blue-400">{d.directory}</span>
                  <span className="font-mono tabular-nums text-slate-500">
                    avg {d.avgRisk} · max {d.maxRisk} ({d.fileCount} files)
                  </span>
                </button>
              ))}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}

export function TechnicalDebtPage({
  repoId,
  onOpenFile,
  onBreadcrumbChange,
}: {
  repoId: string;
  onOpenFile: OpenFileFn;
  onBreadcrumbChange?: (ctx: BreadcrumbContextUpdate) => void;
}) {
  const [data, setData] = useState<TechnicalDebtResult | null>(null);
  const [originFilter, setOriginFilter] = useState<'all' | 'verified_rule' | 'heuristic_indicator'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .get<TechnicalDebtResult>(`/api/repos/${repoId}/debt`)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Technical debt scan failed.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repoId]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.items.filter((item) => {
      if (originFilter !== 'all' && item.origin !== originFilter) return false;
      if (severityFilter !== 'all' && item.severity !== severityFilter) return false;
      if (
        q &&
        !item.path.toLowerCase().includes(q) &&
        !item.title.toLowerCase().includes(q) &&
        !item.category.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [data, originFilter, severityFilter, search]);

  useEffect(() => {
    const segments: BreadcrumbSegment[] = [];
    if (originFilter !== 'all') {
      segments.push({
        id: `origin-${originFilter}`,
        label: originFilter === 'verified_rule' ? 'Verified Rules' : 'Heuristics',
        onClick: severityFilter !== 'all' ? () => setSeverityFilter('all') : undefined,
      });
    }
    if (severityFilter !== 'all') {
      segments.push({
        id: `sev-${severityFilter}`,
        label: `${severityFilter.charAt(0).toUpperCase()}${severityFilter.slice(1)} Severity`,
      });
    }
    if (search.trim()) {
      segments.push({
        id: 'debt-search',
        label: `Filter: "${search.trim()}"`,
      });
    }
    onBreadcrumbChange?.({
      segments,
      activeFilePath: null,
      onResetView: () => {
        setOriginFilter('all');
        setSeverityFilter('all');
        setSearch('');
      },
    });
  }, [originFilter, severityFilter, search, onBreadcrumbChange]);

  if (loading) return <LoadingState label="Scanning security rules and maintainability heuristics..." />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Bugs & Cleanup"
        description="Checks security alerts separately from messy or complex code."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Surface className="border-t-2 border-t-blue-500 p-4">
          <div className="text-xs text-slate-500">All Issues</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
            {data.totalFindings}
          </div>
        </Surface>
        <Surface className="border-t-2 border-t-rose-500 p-4">
          <div className="text-xs text-slate-500">Security Alerts</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
            {data.verifiedCount}
          </div>
        </Surface>
        <Surface className="border-t-2 border-t-amber-500 p-4">
          <div className="text-xs text-slate-500">Code Cleanup</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {data.heuristicCount}
          </div>
        </Surface>
        <Surface className="border-t-2 border-t-orange-500 p-4">
          <div className="text-xs text-slate-500">High Priority</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-orange-600 dark:text-orange-400">
            {data.bySeverity.high}
          </div>
        </Surface>
        <Surface className="border-t-2 border-t-emerald-500 p-4">
          <div className="text-xs text-slate-500">Medium / Low</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-700 dark:text-slate-200">
            {data.bySeverity.medium} / {data.bySeverity.low}
          </div>
        </Surface>
      </div>

      <Surface className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
              {(
                [
                  ['all', 'All'],
                  ['verified_rule', 'Security Alerts'],
                  ['heuristic_indicator', 'Code Cleanup'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setOriginFilter(val)}
                  className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                    originFilter === val
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
              {(['all', 'high', 'medium', 'low'] as const).map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSeverityFilter(sev)}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize whitespace-nowrap transition-colors ${
                    severityFilter === sev
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  {sev === 'all' ? 'All Levels' : sev}
                </button>
              ))}
            </div>
          </div>

          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search rule, path, or category..."
            className="w-64"
          />
        </div>

        <div className="mt-4 space-y-3">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              No findings match the current filter selection.
            </p>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-slate-200 p-4 dark:border-slate-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <SeverityLabel level={item.severity} />
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      {item.origin === 'verified_rule' ? 'Verified Rule' : 'Heuristic'}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span className="capitalize text-slate-500">{item.category}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenFile(item.path, item.line)}
                    className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {item.path}:{item.line}
                  </button>
                </div>

                <h4 className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {item.title}
                </h4>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{item.explanation}</p>
                {item.snippet && (
                  <pre className="mt-2 overflow-x-auto rounded bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    {item.snippet}
                  </pre>
                )}
                <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-medium text-slate-800 dark:text-slate-200">Fix: </span>
                  {item.suggestion}
                </div>
              </div>
            ))
          )}
        </div>
      </Surface>
    </div>
  );
}
