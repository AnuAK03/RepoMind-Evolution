/**
 * Declarative security test suite verifying the "Dirty Dozen" adversarial payloads
 * against the RepoMind Evolution Firestore security model.
 */

export interface RuleTestCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  actorUid: string | null;
  emailVerified: boolean;
  expected: 'PERMISSION_DENIED';
  reason: string;
}

export const DIRTY_DOZEN_CASES: RuleTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated read on user workspace',
    operation: 'get',
    path: '/users/userA',
    actorUid: null,
    emailVerified: false,
    expected: 'PERMISSION_DENIED',
    reason: 'request.auth == null fails Master Gate isSignedIn().',
  },
  {
    id: 2,
    name: 'Unverified email workspace creation',
    operation: 'create',
    path: '/users/userA',
    actorUid: 'userA',
    emailVerified: false,
    expected: 'PERMISSION_DENIED',
    reason: 'request.auth.token.email_verified == true is mandatory.',
  },
  {
    id: 3,
    name: 'Cross-tenant note creation',
    operation: 'create',
    path: '/users/userA/notes/note1',
    actorUid: 'userB',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
    reason: 'isOwner(userA) rejects userB.',
  },
  {
    id: 4,
    name: 'Identity spoofing via ownerId field',
    operation: 'create',
    path: '/users/userA/notes/note1',
    actorUid: 'userA',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
    reason: 'isValidUserNote requires incoming().ownerId == request.auth.uid.',
  },
  {
    id: 5,
    name: 'Shadow admin field injection on create',
    operation: 'create',
    path: '/users/userA',
    actorUid: 'userA',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
    reason: 'keys().hasOnly(...) rejects unapproved isAdmin field.',
  },
  {
    id: 6,
    name: 'Shadow field injection on update',
    operation: 'update',
    path: '/users/userA',
    actorUid: 'userA',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
    reason: 'affectedKeys().hasOnly(...) blocks unapproved key mutation.',
  },
  {
    id: 7,
    name: 'Orphaned snapshot without parent workspace',
    operation: 'create',
    path: '/users/userA/snapshots/snap1',
    actorUid: 'userA',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
    reason: 'hasParentWorkspace(userA) requires parent /users/userA document.',
  },
  {
    id: 8,
    name: 'ID poisoning with invalid path characters',
    operation: 'create',
    path: '/users/userA/notes/bad$id',
    actorUid: 'userA',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
    reason: 'isValidId(noteId) enforces ^[a-zA-Z0-9_\\-]+$ and <= 128 chars.',
  },
  {
    id: 9,
    name: 'Oversized note title payload',
    operation: 'create',
    path: '/users/userA/notes/note1',
    actorUid: 'userA',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
    reason: 'isValidUserNote enforces title.size() <= 160.',
  },
  {
    id: 10,
    name: 'Client-forged createdAt timestamp',
    operation: 'create',
    path: '/users/userA/snapshots/snap1',
    actorUid: 'userA',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
    reason: 'Rule requires createdAt == request.time and updatedAt == request.time.',
  },
  {
    id: 11,
    name: 'Mutating immutable ownerId or createdAt on update',
    operation: 'update',
    path: '/users/userA/notes/note1',
    actorUid: 'userA',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
    reason: 'Update block enforces incoming().ownerId == existing().ownerId and createdAt unchanged.',
  },
  {
    id: 12,
    name: 'Cross-user PII profile read or list',
    operation: 'get',
    path: '/users/userA/private/profile',
    actorUid: 'userB',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
    reason: 'Private profile restricts get to isOwner(userA) and forbids list.',
  },
];
