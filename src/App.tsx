import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  Boxes,
  Command,
  Download,
  FileCode2,
  FlaskConical,
  FolderGit2,
  GitBranch,
  GitCompare,
  HeartPulse,
  LayoutDashboard,
  LogIn,
  Menu,
  Moon,
  ShieldAlert,
  Star,
  Sun,
  TestTube2,
  Users,
  Waypoints,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { api } from './api';
import type { BreadcrumbContextUpdate, FileSummary, HealthStatus, OpenFileFn, RepoMeta } from './types';
import { BreadcrumbBar } from './components/BreadcrumbBar';
import { ExportReportModal } from './components/ExportReportModal';
import {
  StarredRepositoriesSection,
  useStarredRepositories,
  type StarredRepoEntry,
} from './components/StarredRepositoriesSection';
import { ErrorBanner } from './components/UiPrimitives';
import { useFirebase } from './contexts/FirebaseContext';
import { UserDashboardPage } from './pages/UserDashboardPage';
import { ExplorerPage, RepositoryHubPage } from './pages/HubAndExplorer';
import { ChangeImpactPage, GitEvolutionPage } from './pages/GitAndImpact';
import { RiskIntelligencePage, TechnicalDebtPage } from './pages/RiskAndDebt';
import { ArchitectureEvolutionPage, TestImpactPage } from './pages/TestsAndArch';
import { AssistantPage, ContributorsPage, ProjectHealthPage } from './pages/AssistantAndHealth';
import { ComparativeAnalysisPage, ResearchAndReportsPage } from './pages/CompareAndEval';

type ViewId =
  | 'dashboard'
  | 'hub'
  | 'explorer'
  | 'architecture'
  | 'git'
  | 'impact'
  | 'compare'
  | 'risk'
  | 'debt'
  | 'tests'
  | 'health'
  | 'contributors'
  | 'assistant'
  | 'evaluation';

interface NavGroup {
  label: string;
  accent: string;
  items: { id: ViewId; label: string; icon: typeof FolderGit2 }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Account',
    accent: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    items: [{ id: 'dashboard', label: 'My Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Codebase',
    accent: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    items: [
      { id: 'hub', label: 'Overview', icon: FolderGit2 },
      { id: 'explorer', label: 'Code Viewer', icon: FileCode2 },
      { id: 'architecture', label: 'Code Map', icon: Boxes },
    ],
  },
  {
    label: 'Changes',
    accent: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
    items: [
      { id: 'git', label: 'Commit History', icon: GitBranch },
      { id: 'impact', label: 'What Breaks', icon: Waypoints },
      { id: 'compare', label: 'Compare', icon: GitCompare },
    ],
  },
  {
    label: 'Quality',
    accent: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    items: [
      { id: 'risk', label: 'Risk Check', icon: Activity },
      { id: 'debt', label: 'Bugs & Cleanup', icon: ShieldAlert },
      { id: 'tests', label: 'Tests to Run', icon: TestTube2 },
    ],
  },
  {
    label: 'Team & AI',
    accent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    items: [
      { id: 'health', label: 'Health Score', icon: HeartPulse },
      { id: 'contributors', label: 'Team Activity', icon: Users },
      { id: 'assistant', label: 'Ask AI', icon: Bot },
      { id: 'evaluation', label: 'Reports', icon: FlaskConical },
    ],
  },
];

const VIEW_TITLES: Record<ViewId, string> = {
  dashboard: 'My Dashboard',
  hub: 'Overview',
  explorer: 'Code Viewer',
  architecture: 'Code Map',
  git: 'Commit History',
  impact: 'What Breaks',
  compare: 'Compare',
  risk: 'Risk Check',
  debt: 'Bugs & Cleanup',
  tests: 'Tests to Run',
  health: 'Health Score',
  contributors: 'Team Activity',
  assistant: 'Ask AI',
  evaluation: 'Reports',
};

export default function App() {
  const [activeView, setActiveView] = useState<ViewId>('hub');
  const [repositories, setRepositories] = useState<RepoMeta[]>([]);
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);
  const [repoFiles, setRepoFiles] = useState<FileSummary[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [explorerTarget, setExplorerTarget] = useState<{ path: string; line?: number } | null>(null);
  const [impactTarget, setImpactTarget] = useState<{ file?: string; commit?: string } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showIngest, setShowIngest] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [reloadingStarKey, setReloadingStarKey] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const [darkMode, setDarkMode] = useState(true);
  const [appliedAuthPrefs, setAppliedAuthPrefs] = useState(false);
  const [viewBreadcrumbs, setViewBreadcrumbs] = useState<Partial<Record<ViewId, BreadcrumbContextUpdate>>>({});
  const [navHistory, setNavHistory] = useState<
    { view: ViewId; explorerTarget: { path: string; line?: number } | null; impactTarget: { file?: string; commit?: string } | null }[]
  >([]);

  const {
    user,
    workspaceReady,
    workspace,
    profile,
    cloudStars,
    signingIn,
    signInWithGoogle,
    updatePreferences,
    saveCloudStar,
    removeCloudStar,
  } = useFirebase();

  const cloudSync = useMemo(
    () => ({
      enabled: Boolean(user && workspaceReady),
      cloudStars,
      onCloudStar: saveCloudStar,
      onCloudUnstar: removeCloudStar,
    }),
    [user, workspaceReady, cloudStars, saveCloudStar, removeCloudStar]
  );

  const { starredItems, isStarred, toggleStar, unstarEntry } = useStarredRepositories(
    repositories,
    cloudSync
  );

  useEffect(() => {
    if (!user) {
      setAppliedAuthPrefs(false);
      return;
    }
    if (workspace && !appliedAuthPrefs) {
      setDarkMode(workspace.preferredTheme === 'dark');
      setAppliedAuthPrefs(true);
    }
  }, [user, workspace, appliedAuthPrefs]);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickOpen((v) => !v);
        setQuickQuery('');
      } else if (e.key === 'Escape') {
        setQuickOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const refreshRepos = useCallback(async (preferredId?: string) => {
    try {
      const [h, r] = await Promise.all([
        api.get<HealthStatus>('/api/health'),
        api.get<{ repositories: RepoMeta[] }>('/api/repos'),
      ]);
      setHealth(h);
      setRepositories(r.repositories);
      setServerError(null);
      if (preferredId) {
        setActiveRepoId(preferredId);
      } else if (!activeRepoId && r.repositories[0]) {
        setActiveRepoId(r.repositories[0].id);
      }
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Unable to reach RepoMind Evolution server.');
    }
  }, [activeRepoId]);

  useEffect(() => {
    refreshRepos();
  }, []);

  useEffect(() => {
    if (!activeRepoId) {
      setRepoFiles([]);
      return;
    }
    api
      .get<{ files: FileSummary[] }>(`/api/repos/${activeRepoId}/overview`)
      .then((res) => setRepoFiles(res.files))
      .catch(() => setRepoFiles([]));
  }, [activeRepoId]);

  const activeRepo = repositories.find((r) => r.id === activeRepoId) || null;

  const pushHistoryAndNavigate = useCallback(
    (
      nextView: ViewId,
      nextExplorer: { path: string; line?: number } | null = explorerTarget,
      nextImpact: { file?: string; commit?: string } | null = impactTarget
    ) => {
      setNavHistory((prev) => [
        ...prev.slice(-19),
        { view: activeView, explorerTarget, impactTarget },
      ]);
      setExplorerTarget(nextExplorer);
      setImpactTarget(nextImpact);
      setActiveView(nextView);
    },
    [activeView, explorerTarget, impactTarget]
  );

  const handleGoBack = useCallback(() => {
    setNavHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setExplorerTarget(last.explorerTarget);
      setImpactTarget(last.impactTarget);
      setActiveView(last.view);
      return prev.slice(0, -1);
    });
  }, []);

  const handleIngested = (repo: RepoMeta) => {
    setRepositories((prev) => [repo, ...prev.filter((r) => r.id !== repo.id)]);
    setActiveRepoId(repo.id);
    setExplorerTarget(null);
    setImpactTarget(null);
    setNavHistory([]);
    setViewBreadcrumbs({});
    setShowIngest(false);
    setActiveView('hub');
  };

  const handleSelectRepository = useCallback((nextRepoId: string) => {
    setActiveRepoId(nextRepoId);
    setExplorerTarget(null);
    setImpactTarget(null);
    setNavHistory([]);
    setViewBreadcrumbs({});
    setShowIngest(false);
    setMobileMenuOpen(false);
  }, []);

  const handleReloadStarred = useCallback(async (entry: StarredRepoEntry) => {
    const key = `${entry.id}-${entry.sourceRef}`;
    setReloadingStarKey(key);
    setServerError(null);
    try {
      const res =
        entry.source === 'sample'
          ? await api.postJson<{ repository: RepoMeta }>('/api/repos/sample', {})
          : await api.postJson<{ repository: RepoMeta }>('/api/repos/git', { url: entry.sourceRef });
      handleIngested(res.repository);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : `Failed to reload ${entry.name}.`);
    } finally {
      setReloadingStarKey(null);
    }
  }, []);

  const handleOpenFile: OpenFileFn = useCallback(
    (filePath: string, line?: number) => {
      pushHistoryAndNavigate('explorer', { path: filePath, line }, impactTarget);
      setQuickOpen(false);
    },
    [pushHistoryAndNavigate, impactTarget]
  );

  const handleAnalyzeImpact = useCallback(
    (file: string, commit?: string) => {
      pushHistoryAndNavigate('impact', explorerTarget, { file, commit });
      setQuickOpen(false);
    },
    [pushHistoryAndNavigate, explorerTarget]
  );

  const selectView = (id: ViewId) => {
    if (id !== activeView) {
      pushHistoryAndNavigate(id);
    }
    setMobileMenuOpen(false);
    setQuickOpen(false);
  };

  const selectOverviewRoot = useCallback(() => {
    setShowIngest(false);
    if (activeView !== 'hub') {
      pushHistoryAndNavigate('hub');
    }
  }, [activeView, pushHistoryAndNavigate]);

  const breadcrumbCallbacks = useMemo(() => {
    const make = (view: ViewId) => (ctx: BreadcrumbContextUpdate) => {
      setViewBreadcrumbs((prev) => ({ ...prev, [view]: ctx }));
    };
    return {
      dashboard: make('dashboard'),
      hub: make('hub'),
      explorer: make('explorer'),
      architecture: make('architecture'),
      git: make('git'),
      impact: make('impact'),
      compare: make('compare'),
      risk: make('risk'),
      debt: make('debt'),
      tests: make('tests'),
      health: make('health'),
      contributors: make('contributors'),
      assistant: make('assistant'),
      evaluation: make('evaluation'),
    };
  }, []);

  const activeBreadcrumb = viewBreadcrumbs[activeView];

  const quickResults = useMemo(() => {
    const q = quickQuery.trim().toLowerCase();
    const matchedViews = NAV_GROUPS.flatMap((g) => g.items).filter(
      (item) =>
        !activeRepo && item.id !== 'hub' && item.id !== 'dashboard'
          ? false
          : !q || item.label.toLowerCase().includes(q)
    );
    const matchedFiles = repoFiles
      .filter((f) => !q || f.path.toLowerCase().includes(q))
      .slice(0, 12);
    return { matchedViews, matchedFiles };
  }, [quickQuery, repoFiles, activeRepo]);

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between p-3">
      <div className="space-y-5 overflow-y-auto">
        <div className="flex items-center gap-2.5 px-2 pt-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-sm">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6" cy="6" r="2.5" />
              <circle cx="18" cy="8" r="2.5" />
              <circle cx="10" cy="18" r="2.5" />
              <path d="M8 7.5L15.5 8M7 8.5L9.5 15.5M16.5 10L11.8 16" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
              RepoMind Evolution
            </div>
            <div className="text-[11px] text-slate-500 whitespace-nowrap">Change &amp; Risk Workbench</div>
          </div>
        </div>

        <StarredRepositoriesSection
          starredItems={starredItems}
          activeRepo={activeRepo}
          isActiveStarred={isStarred(activeRepo)}
          reloadingKey={reloadingStarKey}
          onSelectRepo={handleSelectRepository}
          onToggleStarActive={() => activeRepo && toggleStar(activeRepo)}
          onUnstar={unstarEntry}
          onReloadStarred={handleReloadStarred}
        />

        <nav aria-label="Workspace Navigation" className="space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-2 pb-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map(({ id, label, icon: Icon }) => {
                  const disabled = id !== 'hub' && id !== 'dashboard' && !activeRepo;
                  const active = activeView === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={disabled}
                      onClick={() => selectView(id)}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs font-medium transition-all duration-150 whitespace-nowrap ${
                        active
                          ? `${group.accent} shadow-xs`
                          : 'text-slate-600 hover:translate-x-0.5 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100'
                      } disabled:opacity-40`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {activeRepo && (
        <div className="mt-4 border-t border-slate-200 px-2 pt-3 text-xs text-slate-500 dark:border-slate-800">
          <div className="truncate font-mono text-[11px] font-medium text-slate-800 dark:text-slate-200" title={activeRepo.name}>
            {activeRepo.name}
          </div>
          <div className="mt-0.5 font-mono text-[11px] tabular-nums">
            {activeRepo.totalFiles} files · {activeRepo.hasGitHistory ? `${activeRepo.commitCount} commits` : 'ZIP snapshot'}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative z-50 w-60 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-3 rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation"
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 items-center gap-2.5 text-xs">
              <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
                {activeRepo ? activeRepo.name : 'Workspace'}
              </span>
              {activeRepo && (
                <span className="hidden font-mono text-[11px] text-slate-500 sm:inline whitespace-nowrap">
                  {activeRepo.hasGitHistory ? `${activeRepo.commitCount} commits` : 'ZIP snapshot'} · {activeRepo.totalFiles} files
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setQuickOpen(true);
                setQuickQuery('');
              }}
              className="hidden items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 sm:inline-flex whitespace-nowrap"
            >
              <Command className="h-3.5 w-3.5" />
              <span>Quick Jump</span>
              <span className="ml-1 font-mono text-[10px] text-slate-400">Ctrl K</span>
            </button>

            {repositories.length > 0 && (
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Select active repository"
                  value={activeRepoId || ''}
                  onChange={(e) => handleSelectRepository(e.target.value)}
                  className="max-w-[180px] rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  {repositories.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {activeRepo && (
                  <button
                    type="button"
                    onClick={() => toggleStar(activeRepo)}
                    title={isStarred(activeRepo) ? `Unstar ${activeRepo.name}` : `Star & pin ${activeRepo.name}`}
                    aria-label={isStarred(activeRepo) ? 'Unstar active repository' : 'Star active repository'}
                    className={`rounded-md border p-1.5 transition-colors ${
                      isStarred(activeRepo)
                        ? 'border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Star className={`h-4 w-4 ${isStarred(activeRepo) ? 'fill-amber-500 text-amber-500' : ''}`} />
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                const next = !darkMode;
                setDarkMode(next);
                if (user && workspaceReady) {
                  void updatePreferences({ preferredTheme: next ? 'dark' : 'light' });
                }
              }}
              aria-label="Toggle color theme"
              className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {activeRepo && (
              <button
                type="button"
                onClick={() => setExportOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span className="hidden sm:inline">Export Summary</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setShowIngest(true);
                setActiveView('hub');
              }}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              Add Repo
            </button>

            {user ? (
              <button
                type="button"
                onClick={() => selectView('dashboard')}
                title="Open My Dashboard"
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeView === 'dashboard'
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                {profile?.photoURL || user.photoURL ? (
                  <img
                    src={profile?.photoURL || user.photoURL || ''}
                    alt={profile?.displayName || user.displayName || 'User'}
                    referrerPolicy="no-referrer"
                    className="h-5 w-5 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                    {(profile?.displayName || user.displayName || 'U').slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="hidden md:inline max-w-[100px] truncate">
                  {profile?.displayName || user.displayName || 'Dashboard'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={signingIn}
                onClick={async () => {
                  const ok = await signInWithGoogle();
                  if (ok) selectView('dashboard');
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>{signingIn ? 'Signing in...' : 'Sign In'}</span>
              </button>
            )}
          </div>
        </header>

        <BreadcrumbBar
          repoName={activeRepo?.name || null}
          repoSource={activeRepo?.source}
          onSelectRoot={selectOverviewRoot}
          viewLabel={VIEW_TITLES[activeView]}
          onSelectView={activeBreadcrumb?.onResetView}
          segments={activeBreadcrumb?.segments || []}
          activeFilePath={activeBreadcrumb?.activeFilePath}
          onOpenInExplorer={activeView !== 'explorer' ? (p) => handleOpenFile(p) : undefined}
          canGoBack={navHistory.length > 0}
          onGoBack={handleGoBack}
        />

        <main className="bg-workspace-mesh min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-4 dark:bg-[#070b14] lg:p-6">
          <motion.div
            key={`${activeRepoId || 'none'}-${activeView}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto max-w-7xl space-y-6"
          >
            {serverError && <ErrorBanner message={serverError} onRetry={() => refreshRepos()} />}

            {activeView === 'dashboard' && (
              <UserDashboardPage
                activeRepo={activeRepo}
                repositories={repositories}
                starredItems={starredItems}
                reloadingStarKey={reloadingStarKey}
                onSelectRepo={handleSelectRepository}
                onReloadStarred={handleReloadStarred}
                onUnstar={unstarEntry}
                onNavigateView={(v) => selectView(v)}
                onThemeChange={(theme) => setDarkMode(theme === 'dark')}
                onBreadcrumbChange={breadcrumbCallbacks.dashboard}
              />
            )}

            {activeView === 'hub' && (
              <RepositoryHubPage
                repoId={activeRepoId}
                meta={activeRepo}
                onIngested={handleIngested}
                onOpenFile={handleOpenFile}
                onAnalyzeImpact={handleAnalyzeImpact}
                showIngest={showIngest}
                setShowIngest={setShowIngest}
                onBreadcrumbChange={breadcrumbCallbacks.hub}
              />
            )}
            {activeRepoId && activeView === 'explorer' && (
              <ExplorerPage
                repoId={activeRepoId}
                target={explorerTarget}
                onAnalyzeImpact={handleAnalyzeImpact}
                onBreadcrumbChange={breadcrumbCallbacks.explorer}
              />
            )}
            {activeRepoId && activeView === 'git' && (
              <GitEvolutionPage
                repoId={activeRepoId}
                onOpenFile={handleOpenFile}
                onAnalyzeImpact={handleAnalyzeImpact}
                onBreadcrumbChange={breadcrumbCallbacks.git}
              />
            )}
            {activeRepoId && activeView === 'impact' && (
              <ChangeImpactPage
                repoId={activeRepoId}
                initialTarget={impactTarget}
                onOpenFile={handleOpenFile}
                onBreadcrumbChange={breadcrumbCallbacks.impact}
              />
            )}
            {activeRepoId && activeView === 'risk' && (
              <RiskIntelligencePage
                repoId={activeRepoId}
                onOpenFile={handleOpenFile}
                onBreadcrumbChange={breadcrumbCallbacks.risk}
              />
            )}
            {activeRepoId && activeView === 'debt' && (
              <TechnicalDebtPage
                repoId={activeRepoId}
                onOpenFile={handleOpenFile}
                onBreadcrumbChange={breadcrumbCallbacks.debt}
              />
            )}
            {activeRepoId && activeView === 'tests' && (
              <TestImpactPage
                repoId={activeRepoId}
                onOpenFile={handleOpenFile}
                onBreadcrumbChange={breadcrumbCallbacks.tests}
              />
            )}
            {activeRepoId && activeView === 'architecture' && (
              <ArchitectureEvolutionPage
                repoId={activeRepoId}
                onOpenFile={handleOpenFile}
                onBreadcrumbChange={breadcrumbCallbacks.architecture}
              />
            )}
            {activeRepoId && activeView === 'assistant' && (
              <AssistantPage
                repoId={activeRepoId}
                healthStatus={health}
                onOpenFile={handleOpenFile}
                onBreadcrumbChange={breadcrumbCallbacks.assistant}
              />
            )}
            {activeRepoId && activeView === 'contributors' && (
              <ContributorsPage
                repoId={activeRepoId}
                onOpenFile={handleOpenFile}
                onBreadcrumbChange={breadcrumbCallbacks.contributors}
              />
            )}
            {activeRepoId && activeView === 'health' && (
              <ProjectHealthPage
                repoId={activeRepoId}
                onOpenFile={handleOpenFile}
                onOpenExport={() => setExportOpen(true)}
                onBreadcrumbChange={breadcrumbCallbacks.health}
              />
            )}
            {activeRepoId && activeView === 'compare' && (
              <ComparativeAnalysisPage
                repoId={activeRepoId}
                repositories={repositories}
                onBreadcrumbChange={breadcrumbCallbacks.compare}
              />
            )}
            {activeRepoId && activeView === 'evaluation' && (
              <ResearchAndReportsPage
                repoId={activeRepoId}
                onBreadcrumbChange={breadcrumbCallbacks.evaluation}
              />
            )}
          </motion.div>
        </main>
      </div>

      {/* Quick Jump Command Palette (Ctrl/Cmd + K) */}
      {quickOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 p-4 pt-20"
          onClick={() => setQuickOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <input
                autoFocus
                type="text"
                value={quickQuery}
                onChange={(e) => setQuickQuery(e.target.value)}
                placeholder="Jump to file path or workspace view..."
                className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none dark:text-slate-100"
              />
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {activeRepo && (!quickQuery.trim() || 'export pdf markdown stakeholder summary'.includes(quickQuery.trim().toLowerCase())) && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-[11px] font-medium text-slate-400">Actions</div>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickOpen(false);
                      setExportOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Download className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Export Stakeholder Summary (PDF / Markdown)</span>
                  </button>
                </div>
              )}

              {quickResults.matchedViews.length > 0 && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-[11px] font-medium text-slate-400">Views</div>
                  {quickResults.matchedViews.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => selectView(v.id)}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <v.icon className="h-3.5 w-3.5 text-slate-400" />
                      <span>{v.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {quickResults.matchedFiles.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[11px] font-medium text-slate-400">Files</div>
                  {quickResults.matchedFiles.map((f) => (
                    <div
                      key={f.path}
                      className="flex items-center justify-between rounded px-2.5 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <button
                        type="button"
                        onClick={() => handleOpenFile(f.path)}
                        className="truncate font-mono text-slate-800 dark:text-slate-200"
                      >
                        {f.path}
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-400">CC {f.maxComplexity}</span>
                        {!f.isTest && (
                          <button
                            type="button"
                            onClick={() => handleAnalyzeImpact(f.path)}
                            className="text-[11px] text-blue-600 hover:underline dark:text-blue-400"
                          >
                            Impact
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeRepo && (
        <ExportReportModal
          repoId={activeRepo.id}
          repoName={activeRepo.name}
          open={exportOpen}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}
