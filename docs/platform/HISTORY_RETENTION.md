# Bounded save history

Personal storage defaults to 2 GiB, 2,000 revisions and 100 profiles. The byte
limit counts complete, uncompressed logical revisions, not a promised physical
disk reservation. Identical files already share content-addressed blobs.

## Retention contract

- Current profile heads and explicitly protected points are never rotated away.
- Existing revisions become protected when retention is first installed.
- New ordinary history keeps ten recent points per profile, one per day for seven
  days and one per week for four weeks. These sets overlap; they are not additive
  guarantees. Daily/weekly buckets are elapsed UTC durations, independent of locale.
- Above 80% of either account budget, discard older ordinary history first, retaining
  the two newest points per profile as well as heads and protected points. The hard
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

Record candidate blob hashes durably with the metadata deletion. Remove a file only
after rechecking every remaining reference, including other users and profiles.
Interrupted physical reclamation is retryable. A failed save must retain its last
published head; pending writeback remains paused. Cleanup must drain active handlers
and downloads before unlinking their files.

Rotate after successful publication and on a bounded background interval. Multiple
application instances share the existing PostgreSQL activity lease; no external
queue or additional service is required. Stop the worker before closing that lease.

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
