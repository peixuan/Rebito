# Bounded save history

Personal storage defaults to 2 GiB, 2,000 revisions and 100 profiles. The byte
limit counts complete, uncompressed logical revisions, not a promised physical
disk reservation. Identical files already share content-addressed blobs.

The site-wide defaults are 10 GiB and 10,000 revisions across all owners. Both
include protected points and restores. The revision count also bounds zero-byte
saves. Configure them with `MAX_TOTAL_SAVE_BYTES` and `MAX_TOTAL_REVISIONS`.

## Retention contract

- Current profile heads and explicitly protected points are never rotated away.
- Existing revisions become protected when retention is first installed.
- DOS keeps one unprotected working revision per profile. Each successful publication
  replaces the previous ordinary head in the same transaction, including imports,
  edits and restores. It covers the complete native group and its runtime overlay.
  Credit the retired head before enforcing quotas. A failed or competing write
  preserves the winning head. Every DOS revision present at upgrade becomes a
  protected backup. **Back up current game** captures and protects the running
  game's files together. **Back up this cloud save** preserves an already synced
  revision without copying files. Both survive future saves until explicitly
  released. Backups count toward the same quotas.
- Console history keeps ten recent points per profile, one per day for seven
  days and one per week for four weeks. These sets overlap; they are not additive
  guarantees. Daily/weekly buckets are elapsed UTC durations, independent of locale.
- Above 80% of either account budget, discard older ordinary history first, retaining
  the two newest points per console profile as well as heads, their actual predecessors and
  protected points. The hard
  quota still applies if these protected bytes alone fill it; never delete them to
  make an upload succeed.
- Manual cleanup previews the exact removals and estimated physical reclamation.
  It keeps the same safety floor. Changes to heads, protection or the candidate set
  invalidate confirmation; users must review a fresh preview.

## Consistency and reclamation

Selection is pure and independently tested. Actual deletion must hold the exclusive
online storage lease and re-evaluate the plan in a transaction. Surviving revision
parents may bypass removed ancestors; their IDs, manifests, bytes and profile heads
do not change. Do not rebase a stale runtime or edit during this compaction.

For an explicit whole-profile removal, the owner reviews the count of all revisions
and protected points. A confirmation binds the profile, owner, name, head, revision
IDs and protection flags. An empty profile can be removed without opening a game.

Record candidate blob hashes before writing save files and with metadata deletion.
Successful publication clears its candidates in the same transaction as the head.
The global counter updates in that transaction, serializing the capacity check across
writers while keeping file I/O concurrent. Rollback releases the claimed capacity.
A failed upload leaves candidates for the reclaimer. Remove a file only
after rechecking every remaining reference, including other users and profiles.
Interrupted physical reclamation is retryable. A failed save must retain its last
published head; pending writeback remains paused. Cleanup must drain active handlers
and downloads before unlinking their files.

Rotate after successful publication, at startup and every 60 seconds. Reclaim at
most 128 files before yielding the exclusive lease; continue remaining batches and
retry errors on the next notification or interval. Multiple application instances
share the existing PostgreSQL activity lease; no external queue or additional service
is required. Stop the worker before closing that lease. Never await rotation while
holding an HTTP request's shared lease.

The workspace shows 100 revisions at a time, with access to older pages. Protection
changes do not alter save bytes or the selected head. Removing protection requires
confirmation. Manual cleanup shows exact revision timestamps and sizes, logical quota
reduction and estimated disk reclamation; shared blobs explain any difference.
If metadata cleanup commits but unlinking fails, report pending reclamation instead
of claiming a rollback. Retrying only reclaims files; it never repeats deletion of
history or republishes a save.

## Deployment capacity

Per-user quotas do not replace the disk free-space guard. Leave room for library
assets, database growth, temporary uploads, build cache and consistent rollback
copies. On the small single-host deployment, five fully used 2 GiB quotas plus a
full library and multiple rollback copies can exceed the disk budget. Refuse a
save/deployment when its reserve is unavailable; never silently prune protected
points or rollback backups to force admission. See [operations](../../platform/OPERATIONS.md).

Compression and delta chains are separate optimizations. They do not bound the
number of versions, and delta chains complicate independent recovery. Keep this
first implementation focused on whole, independently recoverable revisions.
