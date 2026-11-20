import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  OperationType,
  auth,
  clampString,
  db,
  googleProvider,
  handleFirestoreError,
  sanitizeFirestoreId,
} from '../firebase';
import type { RepoMeta } from '../types';

export interface UserWorkspaceDoc {
  ownerId: string;
  preferredTheme: 'dark' | 'light';
  defaultView: 'dashboard' | 'hub' | 'health' | 'risk';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface UserPrivateProfileDoc {
  ownerId: string;
  email: string;
  displayName: string;
  photoURL: string;
  lastLoginAt?: Timestamp | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface CloudStarredRepoDoc {
  starId: string;
  ownerId: string;
  repoId: string;
  name: string;
  source: 'sample' | 'git' | 'zip';
  sourceRef: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface SavedSnapshotDoc {
  snapshotId: string;
  ownerId: string;
  repoId: string;
  repoName: string;
  source: 'sample' | 'git' | 'zip';
  sourceRef: string;
  healthScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  avgRisk: number;
  highRiskCount: number;
  totalFiles: number;
  totalLines: number;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface UserNoteDoc {
  noteId: string;
  ownerId: string;
  repoName: string;
  title: string;
  status: 'open' | 'done';
  priority: 'high' | 'medium' | 'low';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  signingIn: boolean;
  authError: string | null;
  workspaceReady: boolean;
  workspace: UserWorkspaceDoc | null;
  profile: UserPrivateProfileDoc | null;
  cloudStars: CloudStarredRepoDoc[];
  snapshots: SavedSnapshotDoc[];
  notes: UserNoteDoc[];
  signInWithGoogle: () => Promise<boolean>;
  signOutUser: () => Promise<void>;
  updatePreferences: (patch: {
    preferredTheme?: 'dark' | 'light';
    defaultView?: 'dashboard' | 'hub' | 'health' | 'risk';
  }) => Promise<void>;
  saveCloudStar: (repo: RepoMeta) => Promise<void>;
  removeCloudStar: (starId: string) => Promise<void>;
  saveRepoSnapshot: (payload: {
    repo: RepoMeta;
    healthScore: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    avgRisk: number;
    highRiskCount: number;
  }) => Promise<void>;
  deleteSnapshot: (snapshotId: string) => Promise<void>;
  addNote: (input: {
    repoName: string;
    title: string;
    priority: 'high' | 'medium' | 'low';
  }) => Promise<void>;
  toggleNoteStatus: (note: UserNoteDoc) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

export function buildStarDocId(repo: Pick<RepoMeta, 'id' | 'source' | 'sourceRef'>): string {
  const raw = repo.source === 'git' ? `git_${repo.sourceRef}` : repo.id;
  return sanitizeFirestoreId(raw);
}

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);

  const [workspace, setWorkspace] = useState<UserWorkspaceDoc | null>(null);
  const [profile, setProfile] = useState<UserPrivateProfileDoc | null>(null);
  const [cloudStars, setCloudStars] = useState<CloudStarredRepoDoc[]>([]);
  const [snapshots, setSnapshots] = useState<SavedSnapshotDoc[]>([]);
  const [notes, setNotes] = useState<UserNoteDoc[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setWorkspace(null);
        setProfile(null);
        setCloudStars([]);
        setSnapshots([]);
        setNotes([]);
        setWorkspaceReady(false);
      }
    });
    return () => unsub();
  }, []);

  // Ensure parent workspace + isolated PII profile exist whenever user signs in
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;

    let cancelled = false;
    const uid = sanitizeFirestoreId(user.uid);
    const rootPath = `users/${uid}`;
    const profilePath = `users/${uid}/private/profile`;

    async function bootstrapAccount() {
      try {
        const rootRef = doc(db, 'users', uid);
        const rootSnap = await getDoc(rootRef).catch((e) =>
          handleFirestoreError(e, OperationType.GET, rootPath)
        );
        if (!rootSnap.exists()) {
          await setDoc(rootRef, {
            ownerId: uid,
            preferredTheme: 'dark',
            defaultView: 'dashboard',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch((e) => handleFirestoreError(e, OperationType.CREATE, rootPath));
        }

        const profileRef = doc(db, 'users', uid, 'private', 'profile');
        const profileSnap = await getDoc(profileRef).catch((e) =>
          handleFirestoreError(e, OperationType.GET, profilePath)
        );
        const safeEmail = clampString(user!.email || '', 254);
        const safeName = clampString(user!.displayName || 'Developer', 120);
        const safePhoto = clampString(user!.photoURL || '', 500);

        if (!profileSnap.exists()) {
          await setDoc(profileRef, {
            ownerId: uid,
            email: safeEmail,
            displayName: safeName,
            photoURL: safePhoto,
            lastLoginAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch((e) => handleFirestoreError(e, OperationType.CREATE, profilePath));
        } else {
          await updateDoc(profileRef, {
            email: safeEmail,
            displayName: safeName,
            photoURL: safePhoto,
            lastLoginAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch((e) => handleFirestoreError(e, OperationType.UPDATE, profilePath));
        }

        if (!cancelled) setWorkspaceReady(true);
      } catch (e) {
        if (!cancelled) {
          setAuthError(e instanceof Error ? e.message : 'Unable to initialize account.');
        }
      }
    }

    void bootstrapAccount();
    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  // Attach real-time Firestore listeners ONLY when authenticated and bootstrapped
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified || !workspaceReady) return;
    const uid = sanitizeFirestoreId(user.uid);

    const rootPath = `users/${uid}`;
    const unsubRoot = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          setWorkspace(snap.data() as UserWorkspaceDoc);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, rootPath)
    );

    const profilePath = `users/${uid}/private/profile`;
    const unsubProfile = onSnapshot(
      doc(db, 'users', uid, 'private', 'profile'),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserPrivateProfileDoc);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, profilePath)
    );

    const starsPath = `users/${uid}/starredRepos`;
    const unsubStars = onSnapshot(
      query(collection(db, 'users', uid, 'starredRepos'), where('ownerId', '==', uid)),
      (snap) => {
        const items: CloudStarredRepoDoc[] = snap.docs.map((d) => ({
          ...(d.data() as Omit<CloudStarredRepoDoc, 'starId'>),
          starId: d.id,
        }));
        items.sort((a, b) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0));
        setCloudStars(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, starsPath)
    );

    const snapshotsPath = `users/${uid}/snapshots`;
    const unsubSnapshots = onSnapshot(
      query(collection(db, 'users', uid, 'snapshots'), where('ownerId', '==', uid)),
      (snap) => {
        const items: SavedSnapshotDoc[] = snap.docs.map((d) => ({
          ...(d.data() as Omit<SavedSnapshotDoc, 'snapshotId'>),
          snapshotId: d.id,
        }));
        items.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        setSnapshots(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, snapshotsPath)
    );

    const notesPath = `users/${uid}/notes`;
    const unsubNotes = onSnapshot(
      query(collection(db, 'users', uid, 'notes'), where('ownerId', '==', uid)),
      (snap) => {
        const items: UserNoteDoc[] = snap.docs.map((d) => ({
          ...(d.data() as Omit<UserNoteDoc, 'noteId'>),
          noteId: d.id,
        }));
        items.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        setNotes(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, notesPath)
    );

    return () => {
      unsubRoot();
      unsubProfile();
      unsubStars();
      unsubSnapshots();
      unsubNotes();
    };
  }, [authReady, user, workspaceReady]);

  const signInWithGoogle = useCallback(async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sign-in failed.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
      return false;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
  }, []);

  const updatePreferences = useCallback(
    async (patch: {
      preferredTheme?: 'dark' | 'light';
      defaultView?: 'dashboard' | 'hub' | 'health' | 'risk';
    }) => {
      if (!user || !workspaceReady) return;
      const uid = sanitizeFirestoreId(user.uid);
      const path = `users/${uid}`;
      try {
        await updateDoc(doc(db, 'users', uid), {
          ...patch,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, path);
      }
    },
    [user, workspaceReady]
  );

  const saveCloudStar = useCallback(
    async (repo: RepoMeta) => {
      if (!user || !workspaceReady) return;
      const uid = sanitizeFirestoreId(user.uid);
      const starId = buildStarDocId(repo);
      const path = `users/${uid}/starredRepos/${starId}`;
      try {
        const ref = doc(db, 'users', uid, 'starredRepos', starId);
        const existingSnap = await getDoc(ref);
        const payload = {
          name: clampString(repo.name, 120, 'repository'),
          source: repo.source,
          sourceRef: clampString(repo.sourceRef || repo.id, 300, repo.id),
          updatedAt: serverTimestamp(),
        };
        if (existingSnap.exists()) {
          await updateDoc(ref, payload);
        } else {
          await setDoc(ref, {
            ownerId: uid,
            repoId: sanitizeFirestoreId(repo.id),
            ...payload,
            createdAt: serverTimestamp(),
          });
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
      }
    },
    [user, workspaceReady]
  );

  const removeCloudStar = useCallback(
    async (starId: string) => {
      if (!user || !workspaceReady) return;
      const uid = sanitizeFirestoreId(user.uid);
      const cleanStarId = sanitizeFirestoreId(starId);
      const path = `users/${uid}/starredRepos/${cleanStarId}`;
      try {
        await deleteDoc(doc(db, 'users', uid, 'starredRepos', cleanStarId));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, path);
      }
    },
    [user, workspaceReady]
  );

  const saveRepoSnapshot = useCallback(
    async (payload: {
      repo: RepoMeta;
      healthScore: number;
      grade: 'A' | 'B' | 'C' | 'D' | 'F';
      avgRisk: number;
      highRiskCount: number;
    }) => {
      if (!user || !workspaceReady) return;
      const uid = sanitizeFirestoreId(user.uid);
      const snapshotId = sanitizeFirestoreId(`snap_${payload.repo.id}_${Date.now()}`);
      const path = `users/${uid}/snapshots/${snapshotId}`;
      try {
        await setDoc(doc(db, 'users', uid, 'snapshots', snapshotId), {
          ownerId: uid,
          repoId: sanitizeFirestoreId(payload.repo.id),
          repoName: clampString(payload.repo.name, 120, 'repository'),
          source: payload.repo.source,
          sourceRef: clampString(payload.repo.sourceRef || payload.repo.id, 300, payload.repo.id),
          healthScore: Math.max(0, Math.min(100, Math.round(payload.healthScore))),
          grade: payload.grade,
          avgRisk: Math.max(0, Math.min(100, Math.round(payload.avgRisk))),
          highRiskCount: Math.max(0, Math.round(payload.highRiskCount)),
          totalFiles: Math.max(0, Math.round(payload.repo.totalFiles)),
          totalLines: Math.max(0, Math.round(payload.repo.totalLines)),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, path);
      }
    },
    [user, workspaceReady]
  );

  const deleteSnapshot = useCallback(
    async (snapshotId: string) => {
      if (!user || !workspaceReady) return;
      const uid = sanitizeFirestoreId(user.uid);
      const cleanId = sanitizeFirestoreId(snapshotId);
      const path = `users/${uid}/snapshots/${cleanId}`;
      try {
        await deleteDoc(doc(db, 'users', uid, 'snapshots', cleanId));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, path);
      }
    },
    [user, workspaceReady]
  );

  const addNote = useCallback(
    async (input: {
      repoName: string;
      title: string;
      priority: 'high' | 'medium' | 'low';
    }) => {
      if (!user || !workspaceReady) return;
      const cleanTitle = clampString(input.title, 160);
      if (!cleanTitle) return;
      const uid = sanitizeFirestoreId(user.uid);
      const noteId = sanitizeFirestoreId(`note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
      const path = `users/${uid}/notes/${noteId}`;
      try {
        await setDoc(doc(db, 'users', uid, 'notes', noteId), {
          ownerId: uid,
          repoName: clampString(input.repoName, 120, 'General'),
          title: cleanTitle,
          status: 'open',
          priority: input.priority,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, path);
      }
    },
    [user, workspaceReady]
  );

  const toggleNoteStatus = useCallback(
    async (note: UserNoteDoc) => {
      if (!user || !workspaceReady) return;
      const uid = sanitizeFirestoreId(user.uid);
      const cleanId = sanitizeFirestoreId(note.noteId);
      const path = `users/${uid}/notes/${cleanId}`;
      try {
        await updateDoc(doc(db, 'users', uid, 'notes', cleanId), {
          status: note.status === 'open' ? 'done' : 'open',
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, path);
      }
    },
    [user, workspaceReady]
  );

  const deleteNote = useCallback(
    async (noteId: string) => {
      if (!user || !workspaceReady) return;
      const uid = sanitizeFirestoreId(user.uid);
      const cleanId = sanitizeFirestoreId(noteId);
      const path = `users/${uid}/notes/${cleanId}`;
      try {
        await deleteDoc(doc(db, 'users', uid, 'notes', cleanId));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, path);
      }
    },
    [user, workspaceReady]
  );

  const value = useMemo<FirebaseContextValue>(
    () => ({
      user,
      authReady,
      signingIn,
      authError,
      workspaceReady,
      workspace,
      profile,
      cloudStars,
      snapshots,
      notes,
      signInWithGoogle,
      signOutUser,
      updatePreferences,
      saveCloudStar,
      removeCloudStar,
      saveRepoSnapshot,
      deleteSnapshot,
      addNote,
      toggleNoteStatus,
      deleteNote,
    }),
    [
      user,
      authReady,
      signingIn,
      authError,
      workspaceReady,
      workspace,
      profile,
      cloudStars,
      snapshots,
      notes,
      signInWithGoogle,
      signOutUser,
      updatePreferences,
      saveCloudStar,
      removeCloudStar,
      saveRepoSnapshot,
      deleteSnapshot,
      addNote,
      toggleNoteStatus,
      deleteNote,
    ]
  );

  return <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>;
}

export function useFirebase(): FirebaseContextValue {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error('useFirebase must be used inside FirebaseProvider.');
  }
  return ctx;
}
