# Firestore Security Specification

## 1. Data Invariants
1. **Identity Ownership**: Every document under `/users/{userId}` and its subcollections (`/private/profile`, `/starredRepos/{starId}`, `/snapshots/{snapshotId}`, `/notes/{noteId}`) must have `ownerId == request.auth.uid == userId`, and `request.auth.token.email_verified == true`.
2. **Master Gate**: No subcollection document can be created or updated unless the parent `/users/{userId}` document exists and belongs to `request.auth.uid`.
3. **PII Isolation**: `email`, `displayName`, and `photoURL` live strictly inside `/users/{userId}/private/profile` with `allow list: if false;` and `allow get: if isOwner(userId)`.
4. **Strict Keys & Boundaries**: Every document enforces `keys().hasAll(...)` and `keys().hasOnly(...)` with explicit type, enum, regex, numeric range, and `.size()` caps.
5. **Immutable Audit Fields & Server Timestamps**: `ownerId` and `createdAt` cannot change after creation; `createdAt == request.time` on create and `updatedAt == request.time` on update.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Read**: `get(/users/userA)` with `auth == null`.
2. **Unverified Email Write**: `create(/users/userA)` with `auth.uid == 'userA'` and `auth.token.email_verified == false`.
3. **Cross-Tenant Spoofed Create**: `create(/users/userA/notes/note1)` with `auth.uid == 'userB'`, `ownerId: 'userA'`.
4. **UID Spoof Inside Payload**: `create(/users/userA/notes/note1)` with `auth.uid == 'userA'`, `ownerId: 'userB'`.
5. **Shadow / Ghost Field Injection**: `create(/users/userA)` containing `{ ..., isAdmin: true }`.
6. **Update-Gap Shadow Field**: `update(/users/userA)` modifying `preferredTheme` AND adding `extraField: 'hack'`.
7. **Orphaned Subcollection Write**: `create(/users/userA/snapshots/snap1)` when parent `/users/userA` does not exist.
8. **ID Poisoning / Oversized Path ID**: `create(/users/userA/notes/${'a'.repeat(200)})` or invalid characters `note$1`.
9. **Oversized String DoW Attack**: `create(/users/userA/notes/n1)` with `title` exceeding 160 chars.
10. **Client-Forged Timestamp**: `create(/users/userA/snapshots/s1)` with `createdAt` set to a hardcoded past date instead of `request.time`.
11. **Immutable Owner Mutation**: `update(/users/userA/notes/n1)` attempting to change `ownerId` or `createdAt`.
12. **Blanket List / PII Scraping**: `list(/users)` or `list(/users/userA/private)` or `get(/users/userA/private/profile)` by `userB`.
