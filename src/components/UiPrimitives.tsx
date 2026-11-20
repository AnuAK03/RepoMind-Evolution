import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  Folder,
  FolderOpen,
  Search,
} from 'lucide-react';
import type { TreeNode } from '../types';

export function Surface({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors dark:border-slate-800/90 dark:bg-[#0e1418]/95 dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)] ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
      <div className="min-w-0">
        <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SeverityLabel({
  level,
}: {
  level: 'critical' | 'high' | 'medium' | 'low';
}) {
  const styles: Record<string, { text: string; bar: string }> = {
    critical: { text: 'text-rose-700 dark:text-rose-400 font-semibold', bar: 'bg-rose-600 dark:bg-rose-500' },
    high: { text: 'text-orange-700 dark:text-orange-400 font-semibold', bar: 'bg-orange-500' },
    medium: { text: 'text-amber-700 dark:text-amber-400 font-semibold', bar: 'bg-amber-500' },
    low: { text: 'text-emerald-700 dark:text-emerald-400 font-semibold', bar: 'bg-emerald-500' },
  };
  const labels: Record<string, string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  };
  const st = styles[level] || styles.low;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs whitespace-nowrap ${st.text}`}>
      <span aria-hidden="true" className={`h-2.5 w-1 rounded-[1px] ${st.bar}`} />
      {labels[level] || level}
    </span>
  );
}

export function LoadingState({ label = 'Analyzing repository...' }: { label?: string }) {
  return (
    <Surface className="p-6">
      <div className="space-y-3">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-3.5 w-1/2 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-24 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    </Surface>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
    >
      <div className="flex items-center gap-2.5">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-300"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Surface className="p-8 text-center">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-xs text-slate-600 dark:text-slate-400">
        {description}
      </p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </Surface>
  );
}

export function FileTreeView({
  nodes,
  selectedPath,
  onSelect,
  filterQuery = '',
}: {
  nodes: TreeNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  filterQuery?: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>();
    for (const n of nodes) {
      if (n.type === 'dir') init.add(n.path);
    }
    return init;
  });

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const n of nodes) {
        if (n.type === 'dir') next.add(n.path);
      }
      return next;
    });
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return nodes;
    function filterTree(list: TreeNode[]): TreeNode[] {
      const out: TreeNode[] = [];
      for (const n of list) {
        if (n.type === 'file') {
          if (n.path.toLowerCase().includes(q)) out.push(n);
        } else if (n.children) {
          const kids = filterTree(n.children);
          if (kids.length > 0) out.push({ ...n, children: kids });
        }
      }
      return out;
    }
    return filterTree(nodes);
  }, [nodes, filterQuery]);

  const toggle = (dirPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  };

  const renderNodes = (list: TreeNode[], depth: number) =>
    list.map((node) => {
      if (node.type === 'dir') {
        const isOpen = filterQuery.trim().length > 0 || expanded.has(node.path);
        return (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => toggle(node.path)}
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
              className="flex w-full items-center gap-1.5 rounded py-1.5 pr-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              )}
              {isOpen ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              )}
              <span className="truncate">{node.name}</span>
            </button>
            {isOpen && node.children && renderNodes(node.children, depth + 1)}
          </div>
        );
      }

      const active = selectedPath === node.path;
      return (
        <button
          key={node.path}
          type="button"
          onClick={() => onSelect(node.path)}
          style={{ paddingLeft: `${depth * 14 + 24}px` }}
          className={`flex w-full items-center justify-between gap-2 rounded py-1.5 pr-2 text-left text-xs transition-colors ${
            active
              ? 'bg-teal-50 font-medium text-teal-700 dark:bg-teal-950/60 dark:text-teal-300'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
          }`}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <FileCode2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate font-mono">{node.name}</span>
          </span>
          {typeof node.lines === 'number' && (
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-400">
              {node.lines}
            </span>
          )}
        </button>
      );
    });

  return <div className="space-y-0.5">{renderNodes(filteredNodes, 0)}</div>;
}

const CODE_KEYWORDS = new Set([
  'import',
  'from',
  'export',
  'default',
  'return',
  'if',
  'else',
  'elif',
  'for',
  'while',
  'def',
  'class',
  'function',
  'const',
  'let',
  'var',
  'async',
  'await',
  'try',
  'catch',
  'except',
  'finally',
  'raise',
  'throw',
  'with',
  'as',
  'in',
  'not',
  'and',
  'or',
  'true',
  'false',
  'True',
  'False',
  'None',
  'null',
  'undefined',
  'interface',
  'type',
  'extends',
  'implements',
  'new',
  'pass',
  'break',
  'continue',
  'func',
  'package',
]);

function highlightCodeLine(line: string): React.ReactNode {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return <span className="italic text-slate-400 dark:text-slate-500">{line}</span>;
  }
  const tokens = line.split(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g);
  return tokens.map((tok, i) => {
    if (!tok) return null;
    if (
      (tok.startsWith('"') && tok.endsWith('"')) ||
      (tok.startsWith("'") && tok.endsWith("'")) ||
      (tok.startsWith('`') && tok.endsWith('`'))
    ) {
      return (
        <span key={i} className="text-emerald-700 dark:text-emerald-400">
          {tok}
        </span>
      );
    }
    if (/^\d+(?:\.\d+)?$/.test(tok)) {
      return (
        <span key={i} className="text-amber-700 dark:text-amber-400">
          {tok}
        </span>
      );
    }
    if (CODE_KEYWORDS.has(tok)) {
      return (
        <span key={i} className="font-medium text-teal-700 dark:text-teal-400">
          {tok}
        </span>
      );
    }
    if (tok.startsWith('@')) {
      return (
        <span key={i} className="text-cyan-700 dark:text-cyan-400">
          {tok}
        </span>
      );
    }
    return <React.Fragment key={i}>{tok}</React.Fragment>;
  });
}

export function CodeViewer({
  content,
  highlightLine,
  language,
}: {
  content: string;
  highlightLine?: number | null;
  language?: string;
}) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => content.split('\n'), [content]);

  useEffect(() => {
    if (highlightLine && targetRef.current) {
      targetRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [highlightLine, content]);

  const copyAll = () => {
    navigator.clipboard?.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3.5 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        <span className="font-mono tabular-nums">
          {language ? `${language} · ` : ''}
          {lines.length} lines
          {highlightLine ? ` · focused L${highlightLine}` : ''}
        </span>
        <button
          type="button"
          onClick={copyAll}
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="max-h-[60vh] overflow-auto bg-slate-50/40 font-mono text-xs leading-5 dark:bg-slate-950">
        <div className="min-w-max py-2">
          {lines.map((line, i) => {
            const lineNo = i + 1;
            const isTarget = highlightLine === lineNo;
            return (
              <div
                key={lineNo}
                ref={isTarget ? targetRef : undefined}
                className={`flex px-3 ${
                  isTarget
                    ? 'bg-amber-100/90 dark:bg-amber-900/35'
                    : 'hover:bg-slate-100/80 dark:hover:bg-slate-900/70'
                }`}
              >
                <span className="w-11 shrink-0 select-none border-r border-slate-200/80 pr-3 text-right tabular-nums text-slate-400 dark:border-slate-800">
                  {lineNo}
                </span>
                <span className="whitespace-pre pl-3 text-slate-800 dark:text-slate-200">
                  {line ? highlightCodeLine(line) : ' '}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function DiffViewer({ diffText }: { diffText: string }) {
  const lines = diffText.split('\n');
  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-50 font-mono text-[11px] leading-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="min-w-max py-2">
        {lines.map((line, idx) => {
          let cls = 'text-slate-700 dark:text-slate-300';
          if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git')) {
            cls = 'bg-slate-100 font-semibold text-slate-900 dark:bg-slate-900 dark:text-slate-100';
          } else if (line.startsWith('@@')) {
            cls = 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300';
          } else if (line.startsWith('+')) {
            cls = 'bg-emerald-50/90 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
          } else if (line.startsWith('-')) {
            cls = 'bg-red-50/90 text-red-800 dark:bg-red-950/40 dark:text-red-300';
          }
          return (
            <div key={idx} className={`whitespace-pre px-3 ${cls}`}>
              {line || ' '}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />
    </div>
  );
}

export function MarkdownText({
  text,
  onOpenPath,
}: {
  text: string;
  onOpenPath?: (path: string, line?: number) => void;
}) {
  const blocks = text.split(/```/);

  const renderInline = (line: string) => {
    const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        const inner = part.slice(1, -1);
        const pathMatch = inner.match(/^([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)(?::(\d+))?$/);
        if (pathMatch && onOpenPath) {
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onOpenPath(pathMatch[1], pathMatch[2] ? Number(pathMatch[2]) : undefined)}
              className="mx-0.5 rounded bg-teal-50 px-1.5 py-0.5 font-mono text-[11px] text-teal-700 hover:underline dark:bg-teal-950/60 dark:text-teal-300"
            >
              {inner}
            </button>
          );
        }
        return (
          <code
            key={idx}
            className="mx-0.5 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-800 dark:bg-slate-800 dark:text-slate-200"
          >
            {inner}
          </code>
        );
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={idx} className="font-semibold text-slate-900 dark:text-slate-100">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  return (
    <div className="space-y-2.5 text-xs leading-6 text-slate-700 dark:text-slate-300">
      {blocks.map((block, bIdx) => {
        if (bIdx % 2 === 1) {
          const firstNl = block.indexOf('\n');
          const code = firstNl !== -1 ? block.slice(firstNl + 1) : block;
          return (
            <pre
              key={bIdx}
              className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-5 text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
            >
              {code.trimEnd()}
            </pre>
          );
        }
        return block
          .split('\n')
          .map((line, lIdx) => {
            const trimmed = line.trim();
            if (!trimmed) return null;
            if (trimmed.startsWith('### ')) {
              return (
                <h4 key={`${bIdx}-${lIdx}`} className="pt-1 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {renderInline(trimmed.slice(4))}
                </h4>
              );
            }
            if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
              return (
                <h3 key={`${bIdx}-${lIdx}`} className="pt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {renderInline(trimmed.replace(/^#+\s+/, ''))}
                </h3>
              );
            }
            if (/^[-*]\s+/.test(trimmed)) {
              return (
                <div key={`${bIdx}-${lIdx}`} className="flex gap-2 pl-2">
                  <span className="text-slate-400">•</span>
                  <div>{renderInline(trimmed.replace(/^[-*]\s+/, ''))}</div>
                </div>
              );
            }
            if (/^\d+\.\s+/.test(trimmed)) {
              const num = trimmed.match(/^(\d+\.)\s+/)?.[1];
              return (
                <div key={`${bIdx}-${lIdx}`} className="flex gap-2 pl-2">
                  <span className="font-mono text-slate-500">{num}</span>
                  <div>{renderInline(trimmed.replace(/^\d+\.\s+/, ''))}</div>
                </div>
              );
            }
            return <p key={`${bIdx}-${lIdx}`}>{renderInline(trimmed)}</p>;
          });
      })}
    </div>
  );
}
