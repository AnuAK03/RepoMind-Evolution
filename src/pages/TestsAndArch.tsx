import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ExternalLink, GitCompare } from 'lucide-react';
import { api } from '../api';
import type {
  ArchEvolutionResult,
  BreadcrumbContextUpdate,
  BreadcrumbSegment,
  DependencyGraph,
  FileSummary,
  GitHistoryData,
  OpenFileFn,
  TestImpactResult,
} from '../types';
import {
  ErrorBanner,
  LoadingState,
  SectionHeader,
  SeverityLabel,
  Surface,
} from '../components/UiPrimitives';

export function TestImpactPage({
  repoId,
  onOpenFile,
  onBreadcrumbChange,
}: {
  repoId: string;
  onOpenFile: OpenFileFn;
  onBreadcrumbChange?: (ctx: BreadcrumbContextUpdate) => void;
}) {
  const [sourceFiles, setSourceFiles] = useState<FileSummary[]>([]);
  const [target, setTarget] = useState('');
  const [data, setData] = useState<TestImpactResult | null>(null);
  const [riskFilter, setRiskFilter] = useState<'all' | 'high' | 'medium'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ files: FileSummary[] }>(`/api/repos/${repoId}/overview`)
      .then((res) => {
        const nonTest = res.files.filter((f) => !f.isTest && f.symbols > 0);
        setSourceFiles(nonTest);
        if (!target && nonTest[0]) {
          const pref = nonTest.find((f) => f.path.includes('authentication')) || nonTest[0];
          setTarget(pref.path);
        }
      })
      .catch(() => {});
  }, [repoId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const qs = target ? `?target=${encodeURIComponent(target)}` : '';
    api
      .get<TestImpactResult>(`/api/repos/${repoId}/tests${qs}`)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Test impact analysis failed.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repoId, target]);

  useEffect(() => {
    const segments: BreadcrumbSegment[] = [];
    if (target) {
      segments.push({
        id: `test-target-${target}`,
        label: target,
        mono: true,
        title: `Test impact target: ${target}`,
      });
    }
    onBreadcrumbChange?.({
      segments,
      activeFilePath: target || null,
    });
  }, [target, onBreadcrumbChange]);

  const filteredUntested = useMemo(() => {
    if (!data) return [];
    if (riskFilter === 'all') return data.untestedModules;
    if (riskFilter === 'high') {
      return data.untestedModules.filter((u) => u.riskCategory === 'critical' || u.riskCategory === 'high');
    }
    return data.untestedModules.filter((u) => u.riskCategory === 'medium');
  }, [data, riskFilter]);

  if (loading && !data) return <LoadingState label="Finding tests for your code..." />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Tests to Run"
        description="Picks only the tests needed when you edit a file."
        actions={
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
              className="max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 shadow-xs focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {sourceFiles.map((f) => (
              <option key={f.path} value={f.path}>
                Target: {f.path}
              </option>
            ))}
          </select>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Surface className="border-t-2 border-t-teal-500 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Test Suites</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-950 dark:text-white">
            {data.testFiles.length} / {data.totalCases}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {data.frameworks.join(', ') || 'Static discovery'}
          </div>
        </Surface>
        <Surface className="border-t-2 border-t-emerald-500 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Test Coverage</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {data.coverageRatioPct}%
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {data.untestedModules.length} untested files
          </div>
        </Surface>
        <Surface className="border-t-2 border-t-amber-500 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Targeted Tests</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {data.recommendedTestsCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Out of {data.allTestsCount} suites
          </div>
        </Surface>
        <Surface className="border-t-2 border-t-cyan-500 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Time Saved</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums text-cyan-600 dark:text-cyan-400">
            {data.reductionPct}%
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Skipped tests</div>
        </Surface>
        <Surface className="border-t-2 border-t-slate-400 p-4 dark:border-t-slate-600">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Run Mode</div>
          <div className="mt-1 font-display text-base font-bold text-slate-950 dark:text-white">
            Static Scan
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Safe inspection</div>
        </Surface>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Surface className="border-t-2 border-t-teal-500 p-5">
          <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
            Run These Tests{' '}
            <span className="ml-1 font-mono text-xs font-semibold text-teal-600 dark:text-teal-400">
              {data.selectedTarget || 'target'}
            </span>
          </h3>
          {data.recommendations.length === 0 ? (
            <p className="mt-4 text-xs text-amber-700 dark:text-amber-400">
              No direct tests matched {data.selectedTarget}. Add unit tests or run the full suite.
            </p>
          ) : (
            <div className="mt-3 space-y-2.5">
              {data.recommendations.map((rec) => (
                <div
                  key={rec.testPath}
                  className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 transition-colors hover:border-teal-400 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-teal-500/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-teal-600/15 font-mono text-[11px] font-bold text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">
                        {rec.rank}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenFile(rec.testPath)}
                        className="truncate font-mono text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
                      >
                        {rec.testPath}
                      </button>
                    </div>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-emerald-700 dark:text-emerald-400">
                      {rec.caseCount} tests · score {rec.score}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{rec.reason}</p>
                </div>
              ))}
            </div>
          )}
        </Surface>

        <Surface className="border-t-2 border-t-amber-500 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
              Files Missing Tests ({filteredUntested.length})
            </h3>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
              {(['all', 'high', 'medium'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setRiskFilter(level)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${
                    riskFilter === level
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {level === 'all' ? 'All' : level === 'high' ? 'High Risk' : 'Medium'}
                </button>
              ))}
            </div>
          </div>

          {filteredUntested.length === 0 ? (
            <p className="mt-4 text-xs text-emerald-700 dark:text-emerald-400">
              No untested files match this filter.
            </p>
          ) : (
            <div className="mt-3 max-h-80 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2 pr-3 font-medium">File</th>
                    <th className="py-2 pr-3 text-right font-medium">Functions</th>
                    <th className="py-2 pr-3 text-right font-medium">Lines</th>
                    <th className="py-2 text-right font-medium">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {filteredUntested.map((u) => (
                    <tr key={u.path} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          onClick={() => onOpenFile(u.path)}
                          className="font-mono text-teal-600 hover:underline dark:text-teal-400"
                        >
                          {u.path}
                        </button>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">
                        {u.functions + u.classes}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">{u.lines}</td>
                      <td className="py-2 text-right">
                        <SeverityLabel level={u.riskCategory as 'critical' | 'high' | 'medium' | 'low'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Surface>
      </div>

      <Surface className="border-t-2 border-t-slate-400 p-4 text-xs text-slate-600 dark:border-t-slate-600 dark:text-slate-400">
        {data.note}
      </Surface>
    </div>
  );
}

export function ArchitectureEvolutionPage({
  repoId,
  onOpenFile,
  onBreadcrumbChange,
}: {
  repoId: string;
  onOpenFile: OpenFileFn;
  onBreadcrumbChange?: (ctx: BreadcrumbContextUpdate) => void;
}) {
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [git, setGit] = useState<GitHistoryData | null>(null);
  const [baseRef, setBaseRef] = useState('');
  const [headRef, setHeadRef] = useState('');
  const [evo, setEvo] = useState<ArchEvolutionResult | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [includeTests, setIncludeTests] = useState(true);
  const [loading, setLoading] = useState(true);
  const [evoLoading, setEvoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<DependencyGraph>(`/api/repos/${repoId}/architecture`),
      api.get<GitHistoryData>(`/api/repos/${repoId}/git`),
    ])
      .then(([g, gitRes]) => {
        if (!active) return;
        setGraph(g);
        setGit(gitRes);
        if (gitRes.available && gitRes.commits.length >= 2) {
          setBaseRef(gitRes.commits[gitRes.commits.length - 1].sha);
          setHeadRef(gitRes.commits[0].sha);
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Architecture analysis failed.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repoId]);

  const compareSnapshots = async () => {
    if (!baseRef || !headRef) return;
    setEvoLoading(true);
    setError(null);
    try {
      const res = await api.get<ArchEvolutionResult>(
        `/api/repos/${repoId}/architecture/evolution?base=${encodeURIComponent(baseRef)}&head=${encodeURIComponent(headRef)}`
      );
      setEvo(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Snapshot comparison failed.');
    } finally {
      setEvoLoading(false);
    }
  };

  const cycleEdgeKeys = useMemo(() => {
    const s = new Set<string>();
    if (!graph) return s;
    for (const cyc of graph.cycles) {
      for (let i = 0; i < cyc.path.length - 1; i++) {
        s.add(`${cyc.path[i]}->${cyc.path[i + 1]}`);
      }
    }
    return s;
  }, [graph]);

  const diagram = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const filtered = includeTests ? graph.nodes : graph.nodes.filter((n) => !n.isTest);
    const topNodes = [...filtered]
      .sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut))
      .slice(0, 22);
    const idSet = new Set(topNodes.map((n) => n.id));
    const cx = 340;
    const cy = 200;
    const r = 148;
    const positioned = topNodes.map((n, idx) => {
      const angle = (idx / Math.max(1, topNodes.length)) * Math.PI * 2 - Math.PI / 2;
      return {
        ...n,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
      };
    });
    const posMap = new Map(positioned.map((p) => [p.id, p]));
    const edges = graph.edges
      .filter((e) => idSet.has(e.source) && idSet.has(e.target))
      .map((e) => ({
        source: posMap.get(e.source)!,
        target: posMap.get(e.target)!,
        inCycle: cycleEdgeKeys.has(`${e.source}->${e.target}`),
      }));
    return { nodes: positioned, edges };
  }, [graph, includeTests, cycleEdgeKeys]);

  const activeFocusNode = hoveredNode || selectedNode;

  const selectedNodeEdges = useMemo(() => {
    if (!graph || !selectedNode) return { incoming: [], outgoing: [] };
    return {
      incoming: graph.edges.filter((e) => e.target === selectedNode).map((e) => e.source),
      outgoing: graph.edges.filter((e) => e.source === selectedNode).map((e) => e.target),
    };
  }, [graph, selectedNode]);

  useEffect(() => {
    const segments: BreadcrumbSegment[] = [];
    if (selectedNode) {
      segments.push({
        id: `arch-node-${selectedNode}`,
        label: selectedNode,
        mono: true,
        title: `File ${selectedNode}`,
      });
    } else if (evo) {
      segments.push({
        id: 'arch-evo',
        label: `${evo.baseRef.slice(0, 7)} → ${evo.headRef.slice(0, 7)}`,
        mono: true,
        title: 'Map comparison',
      });
    }
    onBreadcrumbChange?.({
      segments,
      activeFilePath: selectedNode,
      onResetView: () => {
        setSelectedNode(null);
        setEvo(null);
      },
    });
  }, [selectedNode, evo, onBreadcrumbChange]);

  if (loading) return <LoadingState label="Building code map..." />;
  if (error) return <ErrorBanner message={error} />;
  if (!graph) return null;

  const hoveredInfo = diagram.nodes.find((n) => n.id === activeFocusNode);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Code Map"
        description="See how code files connect and how links change over commits."
        actions={
          <button
            type="button"
            onClick={() => setIncludeTests((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              includeTests
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
            }`}
          >
            {includeTests ? 'Tests: Shown' : 'Tests: Hidden'}
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <Surface className="border-t-2 border-t-teal-500 p-5 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
              File Connections ({diagram.nodes.length} files · {diagram.edges.length} links)
            </h3>
            <div className="flex items-center gap-3 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                Hub
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-teal-500" />
                File
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                Test
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
                Loop
              </span>
            </div>
          </div>
          <div className="bg-dot-grid mt-3 overflow-x-auto rounded-lg border border-slate-200/80 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950">
            <svg viewBox="0 0 680 400" className="h-[380px] w-full min-w-[560px]">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="16" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
                </marker>
                <marker id="arrow-active" viewBox="0 0 10 10" refX="16" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#14b8a6" />
                </marker>
                <marker id="arrow-cycle" viewBox="0 0 10 10" refX="16" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#f43f5e" />
                </marker>
              </defs>
              {diagram.edges.map((e, i) => {
                const highlighted = activeFocusNode === e.source.id || activeFocusNode === e.target.id;
                const stroke = e.inCycle ? '#f43f5e' : highlighted ? '#14b8a6' : '#94a3b8';
                const marker = e.inCycle
                  ? 'url(#arrow-cycle)'
                  : highlighted
                  ? 'url(#arrow-active)'
                  : 'url(#arrow)';
                const mx = (e.source.x + e.target.x) / 2;
                const my = (e.source.y + e.target.y) / 2;
                const cxCtrl = mx + (340 - mx) * 0.28;
                const cyCtrl = my + (200 - my) * 0.28;
                return (
                  <path
                    key={i}
                    d={`M ${e.source.x} ${e.source.y} Q ${cxCtrl} ${cyCtrl} ${e.target.x} ${e.target.y}`}
                    fill="none"
                    stroke={stroke}
                    strokeOpacity={activeFocusNode ? (highlighted ? 0.95 : 0.1) : e.inCycle ? 0.85 : 0.45}
                    strokeWidth={highlighted || e.inCycle ? 2.2 : 1.2}
                    markerEnd={marker}
                  />
                );
              })}
              {diagram.nodes.map((n) => {
                const isSel = selectedNode === n.id;
                const isHover = hoveredNode === n.id;
                const isHub = n.fanIn >= 3;
                const fill = n.isTest ? '#10b981' : isHub ? '#f59e0b' : '#14b8a6';
                const radius = isSel || isHover ? 12 : Math.min(10.5, 5.5 + n.fanIn);
                const label = n.path.split('/').pop() || n.path;
                return (
                  <g
                    key={n.id}
                    onClick={() => setSelectedNode(n.id === selectedNode ? null : n.id)}
                    onMouseEnter={() => setHoveredNode(n.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    className="cursor-pointer"
                  >
                    {(isSel || isHover || isHub) && (
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={radius + 6}
                        fill={fill}
                        fillOpacity={isSel || isHover ? 0.28 : 0.14}
                      />
                    )}
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={radius}
                      fill={fill}
                      stroke={isSel ? '#f59e0b' : isHover ? '#2dd4bf' : '#ffffff'}
                      strokeWidth={isSel || isHover ? 2.5 : 1.5}
                    />
                    <text
                      x={n.x}
                      y={n.y + 21}
                      textAnchor="middle"
                      className={`font-mono text-[10px] ${
                        isSel || isHover
                          ? 'fill-slate-950 font-semibold dark:fill-white'
                          : 'fill-slate-700 dark:fill-slate-300'
                      }`}
                    >
                      {label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            {hoveredInfo ? (
              <span className="font-mono text-teal-600 dark:text-teal-300">
                {hoveredInfo.path} · {hoveredInfo.fanIn} incoming · {hoveredInfo.fanOut} outgoing
              </span>
            ) : (
              <span>Click or hover any dot to highlight connected files.</span>
            )}
            {selectedNode && (
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="font-semibold text-teal-600 hover:underline dark:text-teal-400"
              >
                Show all files
              </button>
            )}
          </div>
        </Surface>

        <Surface className="border-t-2 border-t-amber-500 p-5 lg:col-span-4">
          {selectedNode ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Selected File</div>
                  <button
                    type="button"
                    onClick={() => onOpenFile(selectedNode)}
                    className="mt-0.5 flex items-center gap-1 break-all text-left font-mono text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
                  >
                    <span>{selectedNode}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedNode(null)}
                  className="shrink-0 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Clear
                </button>
              </div>
              <div>
                <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Files Using This ({selectedNodeEdges.incoming.length})
                </div>
                <div className="mt-1.5 space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  {selectedNodeEdges.incoming.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSelectedNode(p)}
                      className="block w-full truncate text-left hover:text-teal-600 dark:hover:text-teal-400"
                    >
                      ← {p}
                    </button>
                  ))}
                  {selectedNodeEdges.incoming.length === 0 && <div>None</div>}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-teal-600 dark:text-teal-400">
                  Files This Uses ({selectedNodeEdges.outgoing.length})
                </div>
                <div className="mt-1.5 space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  {selectedNodeEdges.outgoing.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSelectedNode(p)}
                      className="block w-full truncate text-left hover:text-teal-600 dark:hover:text-teal-400"
                    >
                      → {p}
                    </button>
                  ))}
                  {selectedNodeEdges.outgoing.length === 0 && <div>None</div>}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                How Files Connect
              </h3>
              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                {graph.facts.facts.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>

              <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Core Files
                </div>
                <div className="mt-2 space-y-1.5">
                  {graph.facts.hubs.map((h) => (
                    <div
                      key={h.id}
                      onMouseEnter={() => setHoveredNode(h.id)}
                      onMouseLeave={() => setHoveredNode(null)}
                      className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/60"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedNode(h.id)}
                        className="truncate font-mono font-medium text-teal-600 hover:underline dark:text-teal-400"
                      >
                        {h.path}
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono tabular-nums text-[11px] text-slate-500">
                          in:{h.fanIn} out:{h.fanOut}
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenFile(h.path)}
                          title="Open code"
                          className="text-slate-400 hover:text-teal-500"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {graph.cycles.length > 0 && (
                <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                  <div className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    Circular Loops ({graph.cycles.length})
                  </div>
                  <div className="mt-2 space-y-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    {graph.cycles.map((c, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedNode(c.path[0] || null)}
                        className="block w-full rounded px-1.5 py-1 text-left transition-colors hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300"
                      >
                        {c.path.join(' → ')}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Surface>
      </div>

      {git?.available && git.commits.length >= 2 && (
        <Surface className="border-t-2 border-t-teal-500 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
            <div>
              <h3 className="flex items-center gap-2 font-display text-sm font-bold text-slate-950 dark:text-white">
                <GitCompare className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                Compare Old vs. New Map
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Compare links between two saved commits.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={baseRef}
                onChange={(e) => setBaseRef(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                {git.commits.map((c) => (
                  <option key={c.sha} value={c.sha}>
                    {c.shortSha} — {c.date.slice(0, 10)} ({c.subject.slice(0, 28)})
                  </option>
                ))}
              </select>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={headRef}
                onChange={(e) => setHeadRef(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                {git.commits.map((c) => (
                  <option key={c.sha} value={c.sha}>
                    {c.shortSha} — {c.date.slice(0, 10)} ({c.subject.slice(0, 28)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={compareSnapshots}
                disabled={evoLoading}
                className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {evoLoading ? 'Comparing...' : 'Compare Now'}
              </button>
            </div>
          </div>

          {evo && (
            <div className="mt-4 space-y-4">
              <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{evo.summary}</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-200 border-t-2 border-t-teal-500 p-3 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">Files</div>
                  <div className="font-mono text-sm font-semibold tabular-nums">
                    {evo.baseStats.nodes} → {evo.headStats.nodes}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 border-t-2 border-t-amber-500 p-3 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">Links</div>
                  <div className="font-mono text-sm font-semibold tabular-nums">
                    {evo.baseStats.edges} → {evo.headStats.edges}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 border-t-2 border-t-rose-500 p-3 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">Loops</div>
                  <div className="font-mono text-sm font-semibold tabular-nums">
                    {evo.baseStats.cycles} → {evo.headStats.cycles}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 border-t-2 border-t-cyan-500 p-3 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">Link Change</div>
                  <div className="font-mono text-sm font-semibold tabular-nums text-cyan-600 dark:text-cyan-400">
                    {evo.couplingDelta >= 0 ? '+' : ''}{evo.couplingDelta} links/file
                  </div>
                </div>
              </div>
            </div>
          )}
        </Surface>
      )}
    </div>
  );
}
