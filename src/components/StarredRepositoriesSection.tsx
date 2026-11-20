import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderGit2, GitBranch, Loader2, PinOff, Plus, RotateCw, Star } from 'lucide-react';
import type { RepoMeta } from '../types';

const STORAGE_KEY = 'repomind.starredRepositories.v1';

export interface StarredRepoEntry {
  id: string;
  name: string;
  source: RepoMeta['source'];
  sourceRef: string;
  starredAt: string;
}

export interface ResolvedStarredRepo extends StarredRepoEntry {
  liveRepo: RepoMeta | null;
}

function readStoredStars(): StarredRepoEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredStars(entries: StarredRepoEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage quota errors
  }
}

function matchesEntry(entry: StarredRepoEntry, repo: RepoMeta): boolean {
  if (entry.id === repo.id) return true;
  if ((repo.source === 'git' || repo.source === 'sample') && entry.sourceRef === repo.sourceRef) {
    return true;
  }
  return false;
}

export interface CloudStarSync {
  enabled: boolean;
  cloudStars: {
    starId: string;
    repoId: string;
    name: string;
    source: RepoMeta['source'];
    sourceRef: string;
    createdAt?: { toDate: () => Date } | null;
  }[];
  onCloudStar: (repo: RepoMeta) => Promise<void>;
  onCloudUnstar: (starId: string) => Promise<void>;
}

export function useStarredRepositories(repositories: RepoMeta[], cloudSync?: CloudStarSync) {
  const [localEntries, setLocalEntries] = useState<StarredRepoEntry[]>(() => readStoredStars());

  useEffect(() => {
    writeStoredStars(localEntries);
  }, [localEntries]);

  const effectiveEntries: StarredRepoEntry[] = useMemo(() => {
    if (cloudSync?.enabled) {
      return cloudSync.cloudStars.map((cs) => ({
        id: cs.repoId,
        name: cs.name,
        source: cs.source,
        sourceRef: cs.sourceRef,
        starredAt: cs.createdAt ? cs.createdAt.toDate().toISOString() : new Date().toISOString(),
      }));
    }
    return localEntries;
  }, [cloudSync?.enabled, cloudSync?.cloudStars, localEntries]);

  const isStarred = useCallback(
    (repo: RepoMeta | null): boolean => {
      if (!repo) return false;
      return effectiveEntries.some((entry) => matchesEntry(entry, repo));
    },
    [effectiveEntries]
  );

  const toggleStar = useCallback(
    (repo: RepoMeta) => {
      if (cloudSync?.enabled) {
        const match = cloudSync.cloudStars.find(
          (cs) =>
            cs.repoId === repo.id ||
            ((repo.source === 'git' || repo.source === 'sample') && cs.sourceRef === repo.sourceRef)
        );
        if (match) {
          void cloudSync.onCloudUnstar(match.starId);
        } else {
          void cloudSync.onCloudStar(repo);
        }
        return;
      }

      setLocalEntries((prev) => {
        const exists = prev.some((entry) => matchesEntry(entry, repo));
        if (exists) {
          return prev.filter((entry) => !matchesEntry(entry, repo));
        }
        const next: StarredRepoEntry = {
          id: repo.id,
          name: repo.name,
          source: repo.source,
          sourceRef: repo.sourceRef,
          starredAt: new Date().toISOString(),
        };
        return [next, ...prev];
      });
    },
    [cloudSync]
  );

  const unstarEntry = useCallback(
    (entryToRemove: StarredRepoEntry) => {
      if (cloudSync?.enabled) {
        const match = cloudSync.cloudStars.find(
          (cs) =>
            cs.repoId === entryToRemove.id ||
            (cs.sourceRef === entryToRemove.sourceRef && cs.source === entryToRemove.source)
        );
        if (match) {
          void cloudSync.onCloudUnstar(match.starId);
        }
        return;
      }

      setLocalEntries((prev) =>
        prev.filter(
          (entry) => !(entry.id === entryToRemove.id && entry.sourceRef === entryToRemove.sourceRef)
        )
      );
    },
    [cloudSync]
  );

  const starredItems: ResolvedStarredRepo[] = useMemo(() => {
    return effectiveEntries.map((entry) => {
      const liveRepo = repositories.find((r) => matchesEntry(entry, r)) || null;
      return {
        ...entry,
        name: liveRepo ? liveRepo.name : entry.name,
        liveRepo,
      };
    });
  }, [effectiveEntries, repositories]);

  return {
    starredItems,
    isStarred,
    toggleStar,
    unstarEntry,
  };
}

export function StarredRepositoriesSection({
  starredItems,
  activeRepo,
  isActiveStarred,
  reloadingKey,
  onSelectRepo,
  onToggleStarActive,
  onUnstar,
  onReloadStarred,
}: {
  starredItems: ResolvedStarredRepo[];
  activeRepo: RepoMeta | null;
  isActiveStarred: boolean;
  reloadingKey: string | null;
  onSelectRepo: (repoId: string) => void;
  onToggleStarActive: () => void;
  onUnstar: (entry: StarredRepoEntry) => void;
  onReloadStarred: (entry: StarredRepoEntry) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-2 pb-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
          <Star className="h-3 w-3 text-amber-500" />
          <span>Starred Repositories</span>
        </div>
        {activeRepo && (
          <button
            type="button"
            onClick={onToggleStarActive}
            title={isActiveStarred ? `Unstar ${activeRepo.name}` : `Pin ${activeRepo.name} to sidebar`}
            className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              isActiveStarred
                ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {isActiveStarred ? (
              <span>Pinned</span>
            ) : (
              <>
                <Plus className="h-2.5 w-2.5" />
                <span>Pin</span>
              </>
            )}
          </button>
        )}
      </div>

      {starredItems.length === 0 ? (
        <div className="mx-2 rounded-md border border-dashed border-slate-200 px-2.5 py-2 text-[11px] leading-4 text-slate-400 dark:border-slate-800 dark:text-slate-500">
          Star a repository to pin it here for instant switching.
        </div>
      ) : (
        <div className="space-y-0.5">
          {starredItems.map((item) => {
            const isSelected = Boolean(item.liveRepo && activeRepo && item.liveRepo.id === activeRepo.id);
            const itemKey = `${item.id}-${item.sourceRef}`;
            const isReloading = reloadingKey === itemKey;
            const canReload = !item.liveRepo && (item.source === 'git' || item.source === 'sample');

            return (
              <div
                key={itemKey}
                className={`group flex items-center justify-between gap-1 rounded-md px-2 py-1.5 text-xs transition-colors ${
                  isSelected
                    ? 'bg-amber-50/80 text-slate-900 dark:bg-amber-950/30 dark:text-slate-100'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <button
                  type="button"
                  disabled={!item.liveRepo && !canReload}
                  onClick={() => {
                    if (item.liveRepo) {
                      onSelectRepo(item.liveRepo.id);
                    } else if (canReload) {
                      onReloadStarred(item);
                    }
                  }}
                  title={
                    item.liveRepo
                      ? `Switch to ${item.name} (${item.liveRepo.totalFiles} files)`
                      : canReload
                      ? `Re-import ${item.name} from ${item.sourceRef}`
                      : `${item.name} (ZIP archive must be re-uploaded)`
                  }
                  className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50"
                >
                  {item.source === 'git' ? (
                    <GitBranch
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isSelected ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                      }`}
                    />
                  ) : (
                    <FolderGit2
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isSelected ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                      }`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[11px] font-medium">{item.name}</div>
                    <div className="truncate font-mono text-[10px] text-slate-400 dark:text-slate-500">
                      {item.liveRepo
                        ? `${item.liveRepo.totalFiles} files${
                            item.liveRepo.hasGitHistory ? ` · ${item.liveRepo.commitCount}c` : ''
                          }`
                        : canReload
                        ? 'Offline · click to re-sync'
                        : 'ZIP offline'}
                    </div>
                  </div>
                </button>

                <div className="flex shrink-0 items-center gap-0.5">
                  {isReloading ? (
                    <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                  ) : (
                    !item.liveRepo &&
                    canReload && (
                      <button
                        type="button"
                        onClick={() => onReloadStarred(item)}
                        title={`Re-clone ${item.name}`}
                        aria-label={`Re-clone ${item.name}`}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-blue-600 dark:hover:bg-slate-700 dark:hover:text-blue-400"
                      >
                        <RotateCw className="h-3 w-3" />
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => onUnstar(item)}
                    title={`Unstar ${item.name}`}
                    aria-label={`Unstar ${item.name}`}
                    className="rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-200/70 hover:text-slate-700 group-hover:opacity-100 focus:opacity-100 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  >
                    <PinOff className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
