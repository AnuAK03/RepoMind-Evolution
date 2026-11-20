import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  Boxes,
  FolderGit2,
  GitBranch,
  HeartPulse,
  LayoutDashboard,
  Loader2,
  LogIn,
  Moon,
  ShieldCheck,
  Star,
  Sun,
  TestTube2,
  Zap,
} from 'lucide-react';
import { api } from '../api';
import { useFirebase } from '../contexts/FirebaseContext';
import type { RepoMeta } from '../types';
import type { ResolvedStarredRepo } from '../components/StarredRepositoriesSection';
import { ErrorBanner, Surface } from '../components/UiPrimitives';

export function OpeningPage({
  darkMode,
  onToggleTheme,
  activeRepo,
  repositories,
  starredItems,
  onIngested,
  onEnterWorkspace,
  onOpenDashboard,
  onSelectRepoAndEnter,
}: {
  darkMode: boolean;
  onToggleTheme: () => void;
  activeRepo: RepoMeta | null;
  repositories: RepoMeta[];
  starredItems: ResolvedStarredRepo[];
  onIngested: (repo: RepoMeta) => void;
  onEnterWorkspace: () => void;
  onOpenDashboard: () => void;
  onSelectRepoAndEnter: (repoId: string) => void;
}) {
  const { user, profile, snapshots, notes, signingIn, authError, signInWithGoogle } = useFirebase();
  const [gitUrl, setGitUrl] = useState('https://github.com/anuak01/RepoMind');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openNotesCount = notes.filter((n) => n.status === 'open').length;
  const displayName = profile?.displayName || user?.displayName || 'Developer';
  const photoURL = profile?.photoURL || user?.photoURL || '';

  const handleGitScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gitUrl.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.postJson<{ repository: RepoMeta }>('/api/repos/git', {
        url: gitUrl.trim(),
      });
      onIngested(res.repository);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to clone Git repository.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSample = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.postJson<{ repository: RepoMeta }>('/api/repos/sample', {});
      onIngested(res.repository);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load sample project.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    const ok = await signInWithGoogle();
    if (ok) {
      onOpenDashboard();
    }
  };

  return (
    <div className="bg-opening-mesh min-h-screen bg-[#f6f8f7] text-slate-900 dark:bg-[#070b0d] dark:text-slate-100">
      {/* Top Bar */}
      <header className="border-b border-slate-200/80 bg-white/85 backdrop-blur-sm dark:border-slate-800/80 dark:bg-[#0c1215]/85">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-600 to-emerald-600 text-white shadow-xs">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="6" cy="6" r="2.5" />
                <circle cx="18" cy="8" r="2.5" />
                <circle cx="10" cy="18" r="2.5" />
                <path d="M8 7.5L15.5 8M7 8.5L9.5 15.5M16.5 10L11.8 16" strokeLinecap="round" />
              </svg>
            </div>
            <span className="font-display text-base font-bold tracking-tight text-slate-950 dark:text-white whitespace-nowrap">
              RepoMind Evolution
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label="Toggle color theme"
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {user ? (
              <button
                type="button"
                onClick={onOpenDashboard}
                className="inline-flex items-center gap-2 rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-500/20 dark:text-teal-300 whitespace-nowrap"
              >
                {photoURL ? (
                  <img
                    src={photoURL}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    className="h-5 w-5 rounded-full object-cover"
                  />
                ) : (
                  <LayoutDashboard className="h-3.5 w-3.5" />
                )}
                <span>My Dashboard</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={signingIn}
                onClick={handleGoogleSignIn}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-300 whitespace-nowrap"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>{signingIn ? 'Signing in...' : 'Sign In'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onEnterWorkspace}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-700 whitespace-nowrap"
            >
              <span>Open Workspace</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Opening Canvas */}
      <main className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6 sm:py-14">
        {authError && <ErrorBanner message={authError} />}
        {error && <ErrorBanner message={error} />}

        {/* Hero + Quick Start */}
        <section className="grid items-start gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-teal-700 dark:text-teal-400">
                <ShieldCheck className="h-4 w-4" />
                <span>Code Risk, Change Impact &amp; Team Health</span>
              </div>
              <h1 className="font-display text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white sm:text-5xl">
                See what breaks before you ship.
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
                Connect a GitHub repository to map file connections, score risky modules, pick the right tests to run, and save project health snapshots to your personal dashboard.
              </p>
            </div>

            {/* Direct Scan Form */}
            <Surface className="border-t-2 border-t-teal-500 p-5">
              <form onSubmit={handleGitScan} className="space-y-3">
                <label
                  htmlFor="opening-git-url"
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  Scan a public GitHub repository
                </label>
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <div className="relative flex-1">
                    <GitBranch className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      id="opening-git-url"
                      type="url"
                      required
                      value={gitUrl}
                      onChange={(e) => setGitUrl(e.target.value)}
                      placeholder="https://github.com/owner/repository"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 font-mono text-xs text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                    {loading ? 'Scanning Repo...' : 'Scan Repository'}
                  </button>
                </div>
              </form>

              <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-slate-200/80 pt-3.5 dark:border-slate-800">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleLoadSample}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-300"
                >
                  <Zap className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  Try Sample Project
                </button>

                {activeRepo && (
                  <button
                    type="button"
                    onClick={onEnterWorkspace}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <FolderGit2 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                    Resume {activeRepo.name}
                  </button>
                )}

                {!user && (
                  <button
                    type="button"
                    disabled={signingIn}
                    onClick={handleGoogleSignIn}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <LogIn className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                    {signingIn ? 'Signing in...' : 'Sign in with Google'}
                  </button>
                )}
              </div>
            </Surface>
          </div>

          {/* Right Panel: Signed-In Dashboard Summary OR Ready Workspaces */}
          <div className="lg:col-span-5">
            {user ? (
              <Surface className="border-t-2 border-t-amber-500 p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {photoURL ? (
                      <img
                        src={photoURL}
                        alt={displayName}
                        referrerPolicy="no-referrer"
                        className="h-10 w-10 rounded-full border-2 border-teal-500 object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 font-display text-xs font-bold text-white">
                        {displayName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-teal-700 dark:text-teal-400">
                        Signed in
                      </div>
                      <div className="truncate font-display text-sm font-bold text-slate-950 dark:text-white">
                        Welcome back, {displayName}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenDashboard}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 whitespace-nowrap"
                  >
                    My Dashboard
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                    <div className="text-[11px] text-slate-500">Starred</div>
                    <div className="mt-0.5 font-mono text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">
                      {starredItems.length}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                    <div className="text-[11px] text-slate-500">Snapshots</div>
                    <div className="mt-0.5 font-mono text-lg font-bold tabular-nums text-teal-600 dark:text-teal-400">
                      {snapshots.length}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                    <div className="text-[11px] text-slate-500">Open Tasks</div>
                    <div className="mt-0.5 font-mono text-lg font-bold tabular-nums text-rose-600 dark:text-rose-400">
                      {openNotesCount}
                    </div>
                  </div>
                </div>

                {starredItems.length > 0 && (
                  <div className="space-y-1.5 border-t border-slate-200/80 pt-3 dark:border-slate-800">
                    <div className="text-[11px] font-medium text-slate-500">Your Starred Projects</div>
                    {starredItems.slice(0, 3).map((item) => (
                      <button
                        key={`${item.id}-${item.sourceRef}`}
                        type="button"
                        onClick={() => {
                          if (item.liveRepo) {
                            onSelectRepoAndEnter(item.liveRepo.id);
                          } else {
                            onOpenDashboard();
                          }
                        }}
                        className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-xs transition-colors hover:border-teal-500 dark:border-slate-800 dark:bg-slate-950/70"
                      >
                        <span className="flex items-center gap-2 truncate font-mono font-medium text-slate-800 dark:text-slate-200">
                          <Star className="h-3.5 w-3.5 shrink-0 fill-amber-500 text-amber-500" />
                          <span className="truncate">{item.name}</span>
                        </span>
                        <span className="shrink-0 text-[11px] text-teal-600 dark:text-teal-400">
                          {item.liveRepo ? 'Open' : 'Dashboard'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </Surface>
            ) : (
              <Surface className="border-t-2 border-t-amber-500 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                      {repositories.length > 0 ? 'Ready in Workspace' : 'Personal Account & Sync'}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {repositories.length > 0
                        ? 'Jump directly into an indexed repository or open your dashboard.'
                        : 'Sign in with Google to save starred repos, health grades, and fix lists.'}
                    </p>
                  </div>
                </div>

                {repositories.length > 0 ? (
                  <div className="space-y-2">
                    {repositories.slice(0, 3).map((repo) => (
                      <button
                        key={repo.id}
                        type="button"
                        onClick={() => onSelectRepoAndEnter(repo.id)}
                        className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-left transition-colors hover:border-teal-500 dark:border-slate-800 dark:bg-slate-950/60"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-white">
                            {repo.name}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                            {repo.totalFiles} files · {repo.hasGitHistory ? `${repo.commitCount} commits` : 'ZIP'}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                      Pin frequently inspected GitHub repositories across devices.
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                      Track saved Health Scores and keep a personal fix checklist.
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled={signingIn}
                  onClick={handleGoogleSignIn}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  {signingIn ? 'Signing in...' : 'Sign in to Open My Dashboard'}
                </button>
              </Surface>
            )}
          </div>
        </section>

        {/* Core Capabilities Grid */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold tracking-tight text-slate-950 dark:text-white">
                Built for clear code decisions
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Every view connects directly to real files, commits, and dependency links.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Surface className="border-t-2 border-t-teal-500 p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-950 dark:text-white">
                <Boxes className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span>Code Map</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Inspect how modules import one another, spot circular loops, and see coupling changes across commits.
              </p>
            </Surface>

            <Surface className="border-t-2 border-t-rose-500 p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-950 dark:text-white">
                <Activity className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                <span>Risk Check</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Rank files by complexity, edit frequency, and blast radius so you fix fragile areas first.
              </p>
            </Surface>

            <Surface className="border-t-2 border-t-amber-500 p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-950 dark:text-white">
                <TestTube2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span>Tests to Run</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Identify only the test suites tied to your edited file and highlight untested risky code.
              </p>
            </Surface>

            <Surface className="border-t-2 border-t-emerald-500 p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-950 dark:text-white">
                <HeartPulse className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Health &amp; Export</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Save health snapshots to your dashboard and export structured PDF or Markdown briefs.
              </p>
            </Surface>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/80 py-6 text-xs text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
          <span className="font-display font-semibold text-slate-800 dark:text-slate-200">
            RepoMind Evolution
          </span>
          <div className="flex items-center gap-4">
            <button type="button" onClick={onEnterWorkspace} className="hover:text-teal-600 dark:hover:text-teal-400">
              Workspace
            </button>
            <button type="button" onClick={onOpenDashboard} className="hover:text-teal-600 dark:hover:text-teal-400">
              My Dashboard
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
