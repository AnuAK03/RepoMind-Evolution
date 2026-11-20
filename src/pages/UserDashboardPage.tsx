import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BookmarkCheck,
  CheckCircle2,
  Circle,
  FileCode2,
  FolderGit2,
  GitBranch,
  HeartPulse,
  Home,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  RotateCw,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react';
import { api } from '../api';
import { useFirebase } from '../contexts/FirebaseContext';
import type {
  BreadcrumbContextUpdate,
  ProjectHealthResult,
  RepoMeta,
  RiskSummaryResult,
} from '../types';
import type { ResolvedStarredRepo, StarredRepoEntry } from '../components/StarredRepositoriesSection';
import { ErrorBanner, LoadingState, SectionHeader, SeverityLabel, Surface } from '../components/UiPrimitives';

export function UserDashboardPage({
  activeRepo,
  repositories,
  starredItems,
  reloadingStarKey,
  onSelectRepo,
  onReloadStarred,
  onUnstar,
  onNavigateView,
  onOpenOpeningPage,
  onThemeChange,
  onBreadcrumbChange,
}: {
  activeRepo: RepoMeta | null;
  repositories: RepoMeta[];
  starredItems: ResolvedStarredRepo[];
  reloadingStarKey: string | null;
  onSelectRepo: (repoId: string) => void;
  onReloadStarred: (entry: StarredRepoEntry) => void;
  onUnstar: (entry: StarredRepoEntry) => void;
  onNavigateView: (view: 'hub' | 'health' | 'risk' | 'explorer') => void;
  onOpenOpeningPage?: () => void;
  onThemeChange: (theme: 'dark' | 'light') => void;
  onBreadcrumbChange?: (ctx: BreadcrumbContextUpdate) => void;
}) {
  const {
    user,
    authReady,
    signingIn,
    authError,
    workspace,
    profile,
    snapshots,
    notes,
    signInWithGoogle,
    signOutUser,
    updatePreferences,
    saveRepoSnapshot,
    deleteSnapshot,
    addNote,
    toggleNoteStatus,
    deleteNote,
  } = useFirebase();

  const [savingSnap, setSavingSnap] = useState(false);
  const [snapFeedback, setSnapFeedback] = useState<string | null>(null);
  const [snapshotSort, setSnapshotSort] = useState<'newest' | 'lowest' | 'risk'>('newest');
  const [noteFilter, setNoteFilter] = useState<'all' | 'open' | 'done'>('all');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteRepo, setNoteRepo] = useState(activeRepo?.name || 'General');
  const [notePriority, setNotePriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    if (activeRepo?.name) {
      setNoteRepo(activeRepo.name);
    }
  }, [activeRepo?.name]);

  useEffect(() => {
    onBreadcrumbChange?.({
      segments: user
        ? [
            {
              id: 'user-account',
              label: profile?.displayName || user.displayName || 'My Account',
            },
          ]
        : [{ id: 'user-signin', label: 'Sign In' }],
      activeFilePath: null,
    });
  }, [user, profile?.displayName, onBreadcrumbChange]);

  const sortedSnapshots = useMemo(() => {
    const list = [...snapshots];
    if (snapshotSort === 'lowest') {
      return list.sort((a, b) => a.healthScore - b.healthScore);
    }
    if (snapshotSort === 'risk') {
      return list.sort((a, b) => b.avgRisk - a.avgRisk);
    }
    return list;
  }, [snapshots, snapshotSort]);

  const filteredNotes = useMemo(() => {
    if (noteFilter === 'all') return notes;
    return notes.filter((n) => n.status === noteFilter);
  }, [notes, noteFilter]);

  const openNotesCount = useMemo(() => notes.filter((n) => n.status === 'open').length, [notes]);

  const avgSavedHealth = useMemo(() => {
    if (snapshots.length === 0) return null;
    const total = snapshots.reduce((acc, s) => acc + s.healthScore, 0);
    return Math.round(total / snapshots.length);
  }, [snapshots]);

  const handleSaveCurrentSnapshot = async () => {
    if (!activeRepo || savingSnap) return;
    setSavingSnap(true);
    setSnapFeedback(null);
    try {
      const [h, r] = await Promise.all([
        api.get<ProjectHealthResult>(`/api/repos/${activeRepo.id}/health`),
        api.get<RiskSummaryResult>(`/api/repos/${activeRepo.id}/risk`),
      ]);
      const highCount = r.distribution.critical + r.distribution.high;
      await saveRepoSnapshot({
        repo: activeRepo,
        healthScore: h.overallScore,
        grade: h.grade,
        avgRisk: r.averageScore,
        highRiskCount: highCount,
      });
      setSnapFeedback(`Saved snapshot for ${activeRepo.name} (Grade ${h.grade}, ${h.overallScore}/100).`);
    } catch (e) {
      setSnapFeedback(e instanceof Error ? e.message : 'Failed to save snapshot.');
    } finally {
      setSavingSnap(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || addingNote) return;
    setAddingNote(true);
    try {
      await addNote({
        repoName: noteRepo || 'General',
        title: noteTitle.trim(),
        priority: notePriority,
      });
      setNoteTitle('');
    } finally {
      setAddingNote(false);
    }
  };

  if (!authReady) {
    return <LoadingState label="Checking sign-in status..." />;
  }

  // Signed-out Login Dashboard View
  if (!user) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="My Dashboard"
          description="Sign in to save your starred projects, health snapshots, and fix checklists."
          actions={
            onOpenOpeningPage ? (
              <button
                type="button"
                onClick={onOpenOpeningPage}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Home className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                Opening Page
              </button>
            ) : undefined
          }
        />

        {authError && <ErrorBanner message={authError} />}

        <Surface className="overflow-hidden border-t-2 border-t-teal-500 p-6 sm:p-8">
          <div className="grid items-center gap-8 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-7">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-teal-700 dark:text-teal-400">
                <ShieldCheck className="h-4 w-4" />
                <span>Personal Workspace Account</span>
              </div>
              <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
                Save your project history across sessions
              </h3>
              <p className="max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Sign in with your Google account to sync starred repositories, bookmark health scores, and keep a personal code-fix checklist tied to each repository.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  disabled={signingIn}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-700 disabled:opacity-50"
                >
                  {signingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                  {signingIn ? 'Signing in...' : 'Sign in with Google'}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateView('hub')}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Continue as Guest
                </button>
              </div>
            </div>

            <div className="grid gap-3 lg:col-span-5">
              <div className="rounded-lg border border-slate-200 border-t-2 border-t-amber-500 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/70">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                  <Star className="h-4 w-4 text-amber-500" />
                  Synced Starred Repos
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Keep your favorite GitHub repositories pinned wherever you log in.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 border-t-2 border-t-emerald-500 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/70">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                  <HeartPulse className="h-4 w-4 text-emerald-500" />
                  Saved Health Snapshots
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Record project grades and risk counts to track improvement over time.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 border-t-2 border-t-rose-500 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/70">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                  <BookmarkCheck className="h-4 w-4 text-rose-500" />
                  Personal Fix Checklist
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Track bugs, risky files, and cleanup reminders per project.
                </p>
              </div>
            </div>
          </div>
        </Surface>
      </div>
    );
  }

  const displayName = profile?.displayName || user.displayName || 'Developer';
  const email = profile?.email || user.email || '';
  const photoURL = profile?.photoURL || user.photoURL || '';
  const initials = displayName
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      <SectionHeader
        title="My Dashboard"
        description="Your account, saved project snapshots, pinned repos, and fix checklist."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {onOpenOpeningPage && (
              <button
                type="button"
                onClick={onOpenOpeningPage}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Home className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                Home
              </button>
            )}
            {activeRepo && (
              <button
                type="button"
                onClick={handleSaveCurrentSnapshot}
                disabled={savingSnap}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50"
              >
                {savingSnap ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookmarkCheck className="h-3.5 w-3.5" />}
                {savingSnap ? 'Saving...' : `Save ${activeRepo.name} Snapshot`}
              </button>
            )}
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        }
      />

      {authError && <ErrorBanner message={authError} />}
      {snapFeedback && (
        <Surface className="border-t-2 border-t-emerald-500 p-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          {snapFeedback}
        </Surface>
      )}

      {/* User Account Banner */}
      <Surface className="border-t-2 border-t-teal-500 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {photoURL ? (
              <img
                src={photoURL}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="h-12 w-12 rounded-full border-2 border-teal-500 object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-600 font-display text-sm font-bold text-white">
                {initials || 'U'}
              </div>
            )}
            <div>
              <div className="font-display text-base font-bold text-slate-950 dark:text-white">
                {displayName}
              </div>
              <div className="font-mono text-xs text-slate-500 dark:text-slate-400">{email}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <span className="font-medium">Theme</span>
              <select
                value={workspace?.preferredTheme || 'dark'}
                onChange={(e) => {
                  const next = e.target.value as 'dark' | 'light';
                  onThemeChange(next);
                  void updatePreferences({ preferredTheme: next });
                }}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <span className="font-medium">Start Page</span>
              <select
                value={workspace?.defaultView || 'dashboard'}
                onChange={(e) => {
                  const next = e.target.value as 'dashboard' | 'hub' | 'health' | 'risk';
                  void updatePreferences({ defaultView: next });
                }}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="dashboard">My Dashboard</option>
                <option value="hub">Overview</option>
                <option value="health">Health Score</option>
                <option value="risk">Risk Check</option>
              </select>
            </label>
          </div>
        </div>
      </Surface>

      {/* Quick Workspace Jumps */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => onNavigateView('hub')}
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-teal-500 dark:border-slate-800 dark:bg-[#0e1418] dark:hover:border-teal-500"
        >
          <div className="flex items-center gap-2.5">
            <FolderGit2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">Overview</div>
              <div className="text-[11px] text-slate-500">{activeRepo ? activeRepo.name : 'Add repo'}</div>
            </div>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
        </button>

        <button
          type="button"
          disabled={!activeRepo}
          onClick={() => onNavigateView('risk')}
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-rose-500 disabled:opacity-50 dark:border-slate-800 dark:bg-[#0e1418] dark:hover:border-rose-500"
        >
          <div className="flex items-center gap-2.5">
            <Activity className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">Risk Check</div>
              <div className="text-[11px] text-slate-500">Hotspot ranking</div>
            </div>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
        </button>

        <button
          type="button"
          disabled={!activeRepo}
          onClick={() => onNavigateView('health')}
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-emerald-500 disabled:opacity-50 dark:border-slate-800 dark:bg-[#0e1418] dark:hover:border-emerald-500"
        >
          <div className="flex items-center gap-2.5">
            <HeartPulse className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">Health Score</div>
              <div className="text-[11px] text-slate-500">Grades &amp; fixes</div>
            </div>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
        </button>

        <button
          type="button"
          disabled={!activeRepo}
          onClick={() => onNavigateView('explorer')}
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-amber-500 disabled:opacity-50 dark:border-slate-800 dark:bg-[#0e1418] dark:hover:border-amber-500"
        >
          <div className="flex items-center gap-2.5">
            <FileCode2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">Code Viewer</div>
              <div className="text-[11px] text-slate-500">Inspect source</div>
            </div>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
        </button>
      </div>

      {/* Account KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Surface className="border-t-2 border-t-amber-500 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Starred Repos</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {starredItems.length}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Synced to your account</div>
        </Surface>
        <Surface className="border-t-2 border-t-teal-500 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Saved Snapshots</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums text-teal-600 dark:text-teal-400">
            {snapshots.length}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Health &amp; risk checkpoints</div>
        </Surface>
        <Surface className="border-t-2 border-t-rose-500 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Open Tasks</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
            {openNotesCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {notes.length} total checklist items
          </div>
        </Surface>
        <Surface className="border-t-2 border-t-emerald-500 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Avg Health Score</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {avgSavedHealth !== null ? `${avgSavedHealth}/100` : '—'}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Across saved snapshots</div>
        </Surface>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Saved Snapshots & Cloud Starred Repos */}
        <div className="space-y-6 lg:col-span-7">
          <Surface className="border-t-2 border-t-teal-500 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                Saved Snapshots ({sortedSnapshots.length})
              </h3>
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
                {([
                  { id: 'newest', label: 'Newest' },
                  { id: 'lowest', label: 'Lowest Score' },
                  { id: 'risk', label: 'Highest Risk' },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSnapshotSort(tab.id)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      snapshotSort === tab.id
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {sortedSnapshots.length === 0 ? (
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                No snapshots saved yet. Click &ldquo;Save Snapshot&rdquo; above while viewing any repository to track its health score here.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {sortedSnapshots.map((snap) => {
                  const live = repositories.find(
                    (r) =>
                      r.id === snap.repoId ||
                      (snap.source === 'git' && r.sourceRef === snap.sourceRef)
                  );
                  const scoreColor =
                    snap.healthScore >= 75
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : snap.healthScore >= 55
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400';

                  return (
                    <div
                      key={snap.snapshotId}
                      className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/60"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                            {snap.repoName}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                            {snap.totalFiles} files · {snap.totalLines.toLocaleString()} lines · avg risk{' '}
                            {snap.avgRisk} · {snap.highRiskCount} risky files
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className={`font-display text-sm font-bold tabular-nums ${scoreColor}`}>
                              Grade {snap.grade} · {snap.healthScore}/100
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {snap.createdAt
                                ? snap.createdAt.toDate().toLocaleDateString()
                                : 'Just now'}
                            </div>
                          </div>
                          {live ? (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectRepo(live.id);
                                onNavigateView('health');
                              }}
                              className="rounded border border-teal-500/40 bg-teal-500/10 px-2.5 py-1 text-[11px] font-semibold text-teal-700 hover:bg-teal-500/20 dark:text-teal-300"
                            >
                              Open
                            </button>
                          ) : (
                            snap.source !== 'zip' && (
                              <button
                                type="button"
                                onClick={() =>
                                  onReloadStarred({
                                    id: snap.repoId,
                                    name: snap.repoName,
                                    source: snap.source,
                                    sourceRef: snap.sourceRef,
                                    starredAt: new Date().toISOString(),
                                  })
                                }
                                className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                Reload
                              </button>
                            )
                          )}
                          <button
                            type="button"
                            onClick={() => void deleteSnapshot(snap.snapshotId)}
                            aria-label={`Delete snapshot for ${snap.repoName}`}
                            className="rounded p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Surface>

          <Surface className="border-t-2 border-t-amber-500 p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                Starred Projects ({starredItems.length})
              </h3>
              <button
                type="button"
                onClick={() => onNavigateView('hub')}
                className="text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
              >
                Add Repo
              </button>
            </div>
            {starredItems.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Click the star button in the top bar on any project to pin it to your account.
              </p>
            ) : (
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {starredItems.map((item) => {
                  const key = `${item.id}-${item.sourceRef}`;
                  const isReloading = reloadingStarKey === key;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/60"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (item.liveRepo) {
                            onSelectRepo(item.liveRepo.id);
                            onNavigateView('hub');
                          } else if (item.source !== 'zip') {
                            onReloadStarred(item);
                          }
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {item.source === 'git' ? (
                          <GitBranch className="h-4 w-4 shrink-0 text-amber-500" />
                        ) : (
                          <FolderGit2 className="h-4 w-4 shrink-0 text-amber-500" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-white">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {item.liveRepo
                              ? `${item.liveRepo.totalFiles} files ready`
                              : item.source !== 'zip'
                              ? 'Click to reload'
                              : 'ZIP needs re-upload'}
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-1">
                        {isReloading && <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-500" />}
                        {!item.liveRepo && item.source !== 'zip' && !isReloading && (
                          <button
                            type="button"
                            onClick={() => onReloadStarred(item)}
                            title="Reload repo"
                            className="rounded p-1 text-slate-400 hover:text-teal-500"
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onUnstar(item)}
                          title="Remove star"
                          className="rounded p-1 text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Surface>
        </div>

        {/* Right: Personal Fix Checklist */}
        <div className="lg:col-span-5">
          <Surface className="border-t-2 border-t-rose-500 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                Fix Checklist ({filteredNotes.length})
              </h3>
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
                {(['all', 'open', 'done'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setNoteFilter(st)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${
                      noteFilter === st
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={handleAddNote}
              className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60"
            >
              <input
                type="text"
                maxLength={160}
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Add a reminder (e.g., Fix auth error handling)..."
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  maxLength={120}
                  value={noteRepo}
                  onChange={(e) => setNoteRepo(e.target.value)}
                  placeholder="Project name"
                  className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
                <select
                  value={notePriority}
                  onChange={(e) => setNotePriority(e.target.value as 'high' | 'medium' | 'low')}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <button
                  type="submit"
                  disabled={!noteTitle.trim() || addingNote}
                  className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
            </form>

            <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">
              {filteredNotes.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  No tasks in this view.
                </p>
              ) : (
                filteredNotes.map((note) => (
                  <div
                    key={note.noteId}
                    className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/60"
                  >
                    <button
                      type="button"
                      onClick={() => void toggleNoteStatus(note)}
                      className="mt-0.5 shrink-0 text-slate-400 hover:text-emerald-500"
                    >
                      {note.status === 'done' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-xs font-medium ${
                          note.status === 'done'
                            ? 'text-slate-400 line-through'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {note.title}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px]">
                        <span className="font-mono text-slate-500">{note.repoName}</span>
                        <SeverityLabel level={note.priority} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteNote(note.noteId)}
                      aria-label="Delete task"
                      className="rounded p-1 text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
