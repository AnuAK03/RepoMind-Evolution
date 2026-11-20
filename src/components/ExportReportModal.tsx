import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, FileText, FileType2, ShieldAlert, X } from 'lucide-react';
import { api } from '../api';
import type { ExportReportSections, StakeholderExportPayload } from '../types';
import {
  DEFAULT_EXPORT_SECTIONS,
  buildFilteredMarkdown,
  downloadMarkdownFile,
  exportStakeholderPdf,
} from '../utils/exportReport';
import { ErrorBanner, LoadingState } from './UiPrimitives';

export function ExportReportModal({
  repoId,
  repoName,
  open,
  onClose,
}: {
  repoId: string;
  repoName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [payload, setPayload] = useState<StakeholderExportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<ExportReportSections>(DEFAULT_EXPORT_SECTIONS);
  const [copied, setCopied] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  useEffect(() => {
    if (!open || !repoId) return;
    let active = true;
    setLoading(true);
    setError(null);
    api
      .get<StakeholderExportPayload>(`/api/repos/${repoId}/report?format=stakeholder`)
      .then((res) => {
        if (active) setPayload(res);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Unable to assemble stakeholder summary.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, repoId]);

  const markdownPreview = useMemo(() => {
    if (!payload) return '';
    return buildFilteredMarkdown(payload, sections);
  }, [payload, sections]);

  if (!open) return null;

  const toggleSection = (key: keyof ExportReportSections) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDownloadPdf = () => {
    if (!payload) return;
    setPdfDownloading(true);
    try {
      exportStakeholderPdf(payload, sections);
    } finally {
      setTimeout(() => setPdfDownloading(false), 300);
    }
  };

  const handleDownloadMarkdown = () => {
    if (!payload) return;
    downloadMarkdownFile(`${payload.meta.id}-stakeholder-summary.md`, markdownPreview);
  };

  const handleCopyMarkdown = () => {
    if (!markdownPreview) return;
    navigator.clipboard?.writeText(markdownPreview).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export Stakeholder Intelligence Summary"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileType2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Export Stakeholder Intelligence Summary
              </h2>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
              {repoName} — Health status, identified risks, and architecture overview
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
          {loading && <LoadingState label="Compiling health, risk, and architecture telemetry..." />}
          {error && <ErrorBanner message={error} />}

          {payload && !loading && (
            <>
              {/* Snapshot Metrics Strip */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-[11px] text-slate-500">Health Grade</div>
                  <div className="mt-1 flex items-baseline gap-1.5 font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                    <span>{payload.health.grade}</span>
                    <span className="text-xs font-medium text-slate-500">
                      ({payload.health.overallScore}/100)
                    </span>
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-[11px] text-slate-500">Critical / High Risk</div>
                  <div className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {payload.risk.distribution.critical + payload.risk.distribution.high}{' '}
                    <span className="text-xs font-normal text-slate-500">files</span>
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-[11px] text-slate-500">Architecture</div>
                  <div className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {payload.graph.edges.length}{' '}
                    <span className="text-xs font-normal text-slate-500">
                      edges ({payload.graph.cycles.length} cycles)
                    </span>
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-[11px] text-slate-500">Verified Security</div>
                  <div className="mt-1 flex items-center gap-1.5 font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    <ShieldAlert className="h-4 w-4 text-amber-600" />
                    <span>{payload.debt.verifiedCount}</span>
                  </div>
                </div>
              </div>

              {/* Section Toggles */}
              <div>
                <div className="mb-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                  Included Sections
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    [
                      ['health', 'Health Status'],
                      ['risks', 'Risks & Security'],
                      ['architecture', 'Architecture'],
                      ['benchmarks', 'Benchmarks'],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/60"
                    >
                      <input
                        type="checkbox"
                        checked={sections[key]}
                        onChange={() => toggleSection(key)}
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Markdown Preview */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Structured Report Preview (Markdown / PDF Outline)
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyMarkdown}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied Markdown' : 'Copy Markdown'}
                  </button>
                </div>
                <pre className="max-h-72 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3.5 font-mono text-[11px] leading-5 text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                  {markdownPreview}
                </pre>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-950">
          <span className="text-[11px] text-slate-500">
            Generates a formatted multi-page PDF or portable Markdown brief for stakeholders.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadMarkdown}
              disabled={!payload || loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <FileText className="h-3.5 w-3.5" />
              Export Markdown (.md)
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!payload || loading || pdfDownloading}
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {pdfDownloading ? 'Building PDF...' : 'Export PDF (.pdf)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
