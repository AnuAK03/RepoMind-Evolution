import React, { useMemo, useState } from 'react';
import type { FileRiskScore, LangStat } from '../types';

const LANG_COLORS: Record<string, string> = {
  Python: '#0d9488',
  TypeScript: '#14b8a6',
  JavaScript: '#f59e0b',
  Go: '#06b6d4',
  Rust: '#ea580c',
  Java: '#e11d48',
  CSS: '#10b981',
  HTML: '#f43f5e',
  JSON: '#d97706',
  Markdown: '#64748b',
};

const FALLBACK_PALETTE = ['#0d9488', '#f59e0b', '#10b981', '#06b6d4', '#ea580c', '#f43f5e'];

export function getLanguageColor(lang: string, idx = 0): string {
  return LANG_COLORS[lang] || FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
}

export function LanguageSpectrumBar({
  languages,
  activeLanguage,
  onSelectLanguage,
}: {
  languages: LangStat[];
  activeLanguage?: string | null;
  onSelectLanguage?: (language: string | null) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (languages.length === 0) return null;

  const focused = hovered || activeLanguage || null;

  return (
    <div className="space-y-2.5">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 p-0.5 dark:bg-slate-800/80">
        {languages.map((lang, idx) => {
          const color = getLanguageColor(lang.language, idx);
          const isDim = focused !== null && focused !== lang.language;
          return (
            <button
              key={lang.language}
              type="button"
              onMouseEnter={() => setHovered(lang.language)}
              onMouseLeave={() => setHovered(null)}
              onClick={() =>
                onSelectLanguage?.(activeLanguage === lang.language ? null : lang.language)
              }
              title={`${lang.language}: ${lang.percentage}% (${lang.lines.toLocaleString()} lines)`}
              style={{
                width: `${Math.max(2.5, lang.percentage)}%`,
                backgroundColor: color,
                opacity: isDim ? 0.3 : 1,
              }}
              className="h-full transition-all duration-150 first:rounded-l-full last:rounded-r-full"
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        {languages.slice(0, 6).map((lang, idx) => {
          const color = getLanguageColor(lang.language, idx);
          const isSelected = activeLanguage === lang.language;
          return (
            <button
              key={lang.language}
              type="button"
              onMouseEnter={() => setHovered(lang.language)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelectLanguage?.(isSelected ? null : lang.language)}
              className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-left transition-colors ${
                isSelected
                  ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: color }}
              />
              <span className="font-medium text-slate-800 dark:text-slate-200">{lang.language}</span>
              <span className="font-mono text-[11px] tabular-nums text-slate-500">
                {lang.percentage}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RiskScatterChart({
  files,
  selectedPath,
  onSelectFile,
}: {
  files: FileRiskScore[];
  selectedPath?: string | null;
  onSelectFile: (file: FileRiskScore) => void;
}) {
  const [hovered, setHovered] = useState<FileRiskScore | null>(null);
  const [levelFilter, setLevelFilter] = useState<'all' | 'elevated' | 'medium' | 'low'>('all');

  const getFactor = (f: FileRiskScore, keyword: string) =>
    f.factors.find((fac) => fac.name.toLowerCase().includes(keyword));

  const points = useMemo(() => {
    const list = files.slice(0, 45).filter((f) => {
      if (levelFilter === 'elevated') return f.category === 'critical' || f.category === 'high';
      if (levelFilter === 'medium') return f.category === 'medium';
      if (levelFilter === 'low') return f.category === 'low';
      return true;
    });
    const w = 520;
    const h = 236;
    const padL = 40;
    const padR = 18;
    const padT = 18;
    const padB = 30;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    return {
      w,
      h,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      items: list.map((f) => {
        const ccFac = getFactor(f, 'complex') || f.factors[0];
        const churnFac = getFactor(f, 'churn');
        const blastFac = getFactor(f, 'blast') || getFactor(f, 'coupling');
        const ccNorm = (ccFac?.normalized ?? 0) / 100;
        const churnNorm = (churnFac?.normalized ?? 0) / 100;
        const blastNorm = (blastFac?.normalized ?? 0) / 100;
        const xVal = Math.min(1, churnFac ? ccNorm * 0.65 + churnNorm * 0.35 : ccNorm);
        const yVal = Math.min(1, f.score / 100);
        const x = padL + xVal * plotW;
        const y = padT + (1 - yVal) * plotH;
        const r = Math.min(12, Math.max(5, 5 + blastNorm * 6));
        const fill =
          f.category === 'critical'
            ? '#f43f5e'
            : f.category === 'high'
            ? '#f97316'
            : f.category === 'medium'
            ? '#f59e0b'
            : '#10b981';
        return { file: f, x, y, r, fill };
      }),
    };
  }, [files, levelFilter]);

  if (files.length === 0) return null;

  const activePoint = hovered ? points.items.find((p) => p.file.path === hovered.path) : null;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5 dark:bg-slate-800/80">
          {(
            [
              ['all', 'All'],
              ['elevated', 'High Risk'],
              ['medium', 'Medium'],
              ['low', 'Safe'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setLevelFilter(val)}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                levelFilter === val
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-slate-500">Bigger dot = bigger impact</span>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/80">
        <svg viewBox={`0 0 ${points.w} ${points.h}`} className="h-56 w-full">
          <defs>
            <linearGradient id="dangerQuad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#f97316" stopOpacity="0.03" />
            </linearGradient>
          </defs>

          <rect
            x={points.padL + points.plotW * 0.5}
            y={points.padT}
            width={points.plotW * 0.5}
            height={points.plotH * 0.48}
            fill="url(#dangerQuad)"
          />

          {[0.25, 0.5, 0.75, 1].map((t) => {
            const y = points.padT + (1 - t) * points.plotH;
            return (
              <g key={`y-${t}`}>
                <line
                  x1={points.padL}
                  y1={y}
                  x2={points.w - points.padR}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeDasharray="3 3"
                />
                <text
                  x={points.padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 font-mono text-[9px]"
                >
                  {Math.round(t * 100)}
                </text>
              </g>
            );
          })}

          <line
            x1={points.padL + points.plotW * 0.5}
            y1={points.padT}
            x2={points.padL + points.plotW * 0.5}
            y2={points.h - points.padB}
            stroke="currentColor"
            className="text-slate-300 dark:text-slate-700"
            strokeDasharray="3 3"
          />

          <line
            x1={points.padL}
            y1={points.h - points.padB}
            x2={points.w - points.padR}
            y2={points.h - points.padB}
            stroke="currentColor"
            className="text-slate-300 dark:text-slate-700"
          />
          <line
            x1={points.padL}
            y1={points.padT}
            x2={points.padL}
            y2={points.h - points.padB}
            stroke="currentColor"
            className="text-slate-300 dark:text-slate-700"
          />

          {activePoint && (
            <>
              <line
                x1={activePoint.x}
                y1={points.padT}
                x2={activePoint.x}
                y2={points.h - points.padB}
                stroke={activePoint.fill}
                strokeOpacity={0.35}
                strokeDasharray="2 2"
              />
              <line
                x1={points.padL}
                y1={activePoint.y}
                x2={points.w - points.padR}
                y2={activePoint.y}
                stroke={activePoint.fill}
                strokeOpacity={0.35}
                strokeDasharray="2 2"
              />
            </>
          )}

          <text
            x={points.padL + points.plotW / 2}
            y={points.h - 8}
            textAnchor="middle"
            className="fill-slate-500 text-[10px]"
          >
            Complexity &amp; Edit Frequency →
          </text>
          <text
            x={points.w - points.padR - 4}
            y={points.padT + 12}
            textAnchor="end"
            className="fill-rose-600/90 text-[9px] font-semibold dark:fill-rose-400"
          >
            Fix First Zone
          </text>

          {points.items.map(({ file, x, y, r, fill }) => {
            const isActive = selectedPath === file.path || hovered?.path === file.path;
            return (
              <g
                key={file.path}
                onMouseEnter={() => setHovered(file)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelectFile(file)}
                className="cursor-pointer"
              >
                {isActive && <circle cx={x} cy={y} r={r + 5} fill={fill} fillOpacity={0.28} />}
                <circle
                  cx={x}
                  cy={y}
                  r={isActive ? r + 2 : r}
                  fill={fill}
                  fillOpacity={0.88}
                  stroke={isActive ? '#0f172a' : '#ffffff'}
                  strokeWidth={isActive ? 2 : 1.25}
                  className="transition-all duration-150"
                />
              </g>
            );
          })}
        </svg>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 bg-white/90 px-3 py-2 text-[11px] dark:border-slate-800 dark:bg-slate-900/90">
          {hovered ? (
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono font-semibold text-slate-900 dark:text-white">
                {hovered.path}
              </span>
              <span className="shrink-0 font-mono tabular-nums text-teal-600 dark:text-teal-400">
                Score {hovered.score}/100 · #{hovered.integratedRank}
              </span>
            </div>
          ) : (
            <span className="text-slate-500">Hover or click a dot to check that file</span>
          )}
          <div className="flex shrink-0 items-center gap-3 text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-[2px] bg-rose-500" />
              High Risk
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-[2px] bg-amber-500" />
              Medium
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-[2px] bg-emerald-500" />
              Safe
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RadialScoreGauge({
  score,
  label,
  sublabel,
  size = 112,
  tone = 'auto',
}: {
  score: number;
  label: string;
  sublabel?: string;
  size?: number;
  tone?: 'auto' | 'risk';
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const strokeW = 10;
  const radius = (size - strokeW) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (clamped / 100) * circ;

  const strokeColor =
    tone === 'risk'
      ? clamped >= 65
        ? '#f43f5e'
        : clamped >= 38
        ? '#f59e0b'
        : '#10b981'
      : clamped >= 75
      ? '#10b981'
      : clamped >= 50
      ? '#f59e0b'
      : '#f43f5e';

  return (
    <div className="flex items-center gap-3.5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeW}
            className="text-slate-200/80 dark:text-slate-800"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {clamped}
          </span>
          <span className="text-[10px] font-medium text-slate-400">/ 100</span>
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900 dark:text-white">{label}</div>
        {sublabel && <div className="mt-0.5 text-xs text-slate-500">{sublabel}</div>}
      </div>
    </div>
  );
}

export function DimensionRadarChart({
  dimensions,
}: {
  dimensions: { name: string; score: number; weight: number }[];
}) {
  const [hoveredDim, setHoveredDim] = useState<string | null>(null);
  if (dimensions.length < 3) return null;
  const size = 250;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 76;
  const n = dimensions.length;

  const pointAt = (idx: number, ratio: number) => {
    const angle = (idx / n) * Math.PI * 2 - Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * maxR * ratio,
      y: cy + Math.sin(angle) * maxR * ratio,
      lx: cx + Math.cos(angle) * (maxR + 22),
      ly: cy + Math.sin(angle) * (maxR + 18),
    };
  };

  const polyPoints = dimensions
    .map((d, idx) => {
      const p = pointAt(idx, Math.max(0.08, d.score / 100));
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-52 w-52">
        {[0.25, 0.5, 0.75, 1].map((ring) => {
          const ringPts = dimensions
            .map((_, idx) => {
              const p = pointAt(idx, ring);
              return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
            })
            .join(' ');
          return (
            <polygon
              key={ring}
              points={ringPts}
              fill="none"
              stroke="currentColor"
              className="text-slate-200 dark:text-slate-800"
              strokeWidth={1}
            />
          );
        })}

        <polygon
          points={polyPoints}
          className="fill-teal-500/25 stroke-teal-600 dark:fill-teal-400/20 dark:stroke-teal-400"
          strokeWidth={2}
        />

        {dimensions.map((d, idx) => {
          const outer = pointAt(idx, 1);
          const val = pointAt(idx, Math.max(0.08, d.score / 100));
          const active = hoveredDim === d.name;
          return (
            <g
              key={d.name}
              onMouseEnter={() => setHoveredDim(d.name)}
              onMouseLeave={() => setHoveredDim(null)}
              className="cursor-pointer"
            >
              <line
                x1={cx}
                y1={cy}
                x2={outer.x}
                y2={outer.y}
                stroke="currentColor"
                className="text-slate-200 dark:text-slate-800"
                strokeWidth={1}
              />
              <text
                x={outer.lx}
                y={outer.ly}
                textAnchor="middle"
                dominantBaseline="middle"
                className={`text-[9px] font-medium ${
                  active ? 'fill-teal-600 dark:fill-teal-400' : 'fill-slate-600 dark:fill-slate-400'
                }`}
              >
                {d.name.split(' ')[0]} ({d.score})
              </text>
              <circle
                cx={val.x}
                cy={val.y}
                r={active ? 5 : 3.5}
                className="fill-teal-600 dark:fill-teal-400"
              />
            </g>
          );
        })}
      </svg>
      <div className="min-h-[18px] text-center text-[11px] text-slate-500">
        {hoveredDim ? hoveredDim : 'Hover points to inspect scores'}
      </div>
    </div>
  );
}
