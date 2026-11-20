import React, { useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Copy, FolderGit2, Layers } from 'lucide-react';
import type { BreadcrumbSegment } from '../types';

export type { BreadcrumbSegment };

export function BreadcrumbBar({
  repoName,
  repoSource,
  onSelectRoot,
  viewLabel,
  onSelectView,
  segments,
  activeFilePath,
  onOpenInExplorer,
  canGoBack,
  onGoBack,
}: {
  repoName: string | null;
  repoSource?: string;
  onSelectRoot: () => void;
  viewLabel: string;
  onSelectView?: () => void;
  segments: BreadcrumbSegment[];
  activeFilePath?: string | null;
  onOpenInExplorer?: (filePath: string) => void;
  canGoBack?: boolean;
  onGoBack?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const items: BreadcrumbSegment[] = [
    {
      id: 'workspace',
      label: 'Workspaces',
      title: 'Return to Repository Overview',
      onClick: repoName || segments.length > 0 ? onSelectRoot : undefined,
    },
  ];

  if (repoName) {
    items.push({
      id: 'repo',
      label: repoName,
      mono: true,
      title: `${repoName}${repoSource ? ` (${repoSource})` : ''} — Overview`,
      onClick: onSelectRoot,
    });
  }

  items.push({
    id: 'view',
    label: viewLabel,
    onClick: segments.length > 0 ? onSelectView : undefined,
  });

  for (const seg of segments) {
    items.push(seg);
  }

  const copyPath = () => {
    if (!activeFilePath) return;
    navigator.clipboard?.writeText(activeFilePath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="shrink-0 border-b border-slate-200 bg-slate-50/95 px-4 py-2 dark:border-slate-800 dark:bg-slate-950/95 lg:px-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {canGoBack && onGoBack && (
            <button
              type="button"
              onClick={onGoBack}
              title="Back to previous context"
              aria-label="Back to previous context"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <ArrowLeft className="h-3 w-3" />
            </button>
          )}

          <nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-x-auto">
            <ol className="flex items-center gap-1 text-xs whitespace-nowrap">
              {items.map((item, idx) => {
                const isLast = idx === items.length - 1;
                const isWorkspace = item.id === 'workspace';
                const isRepo = item.id === 'repo';
                const clickable = !isLast && Boolean(item.onClick);

                return (
                  <li key={`${item.id}-${idx}`} className="flex min-w-0 items-center gap-1">
                    {idx > 0 && (
                      <ChevronRight
                        aria-hidden="true"
                        className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-600"
                      />
                    )}
                    {clickable ? (
                      <button
                        type="button"
                        onClick={item.onClick}
                        title={item.title || item.label}
                        className={`inline-flex max-w-[200px] items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-slate-200/70 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${
                          item.mono
                            ? 'font-mono text-slate-700 dark:text-slate-300'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {isWorkspace && <Layers className="h-3 w-3 shrink-0 text-slate-400" />}
                        {isRepo && <FolderGit2 className="h-3 w-3 shrink-0 text-teal-600 dark:text-teal-400" />}
                        <span className="truncate">{item.label}</span>
                      </button>
                    ) : (
                      <span
                        aria-current={isLast ? 'page' : undefined}
                        title={item.title || item.label}
                        className={`inline-flex max-w-[260px] items-center gap-1.5 px-1.5 py-0.5 ${
                          isLast
                            ? 'font-semibold text-slate-900 dark:text-slate-100'
                            : 'text-slate-500 dark:text-slate-400'
                        } ${item.mono ? 'font-mono' : ''}`}
                      >
                        {isWorkspace && <Layers className="h-3 w-3 shrink-0 text-slate-400" />}
                        {isRepo && <FolderGit2 className="h-3 w-3 shrink-0 text-teal-600 dark:text-teal-400" />}
                        <span className="truncate">{item.label}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>

        {activeFilePath && (
          <div className="flex shrink-0 items-center gap-1.5">
            {onOpenInExplorer && (
              <button
                type="button"
                onClick={() => onOpenInExplorer(activeFilePath)}
                className="hidden rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-teal-500 hover:text-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 sm:inline-flex whitespace-nowrap"
              >
                Open Source
              </button>
            )}
            <button
              type="button"
              onClick={copyPath}
              title={`Copy ${activeFilePath}`}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 whitespace-nowrap"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-600" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span className="hidden sm:inline">Copy path</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
