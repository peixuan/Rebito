# Save synchronization and recovery

The platform stores a revision of a file collection, not a universal game save.
A DOS manifest declares portable native save paths in `saveFiles`, including
subdirectories. Captures include existing declared files and the runtime overlay;
editors replace a validated group while reusing untouched cloud artifacts.

## Automatic and explicit saves

DOS checks approximately every 30 seconds. A new version is published only when
declared native file bytes, names or membership differ from the running base.
Archive-only differences do not create automatic history entries. Explicit
**同步并刷新**, Stop, library navigation and logout capture the full collection.
All publication paths use the same ownership checks, quotas and revision guard.

This uploads files already saved by the game. It neither presses the game's save
command nor records DOS RAM. Each capture pauses the runtime and resumes its prior
state after success. An upload failure retains the paused runtime for retry.
Background browser throttling may delay timers; closing the page does not complete
an asynchronous upload. A before-unload warning protects normal reload/close, but
forced termination or power loss can lose changes after the latest successful sync.
There is currently no durable offline browser outbox.

## Conflicts

The server compares the submitted base revision with the current head atomically.
A stale writer receives a conflict instead of replacing the newer head. Binary
save files are not automatically merged: game-specific indexes and checksums can
make a byte-level merge invalid even when changes appear disjoint.

The player retains its runtime and offers two explicit choices:

- **本地进度另存为新进度** captures the complete local collection into a separate
  private profile, leaving the original cloud branch intact. Only after successful
  publication does the UI open that profile. Retries retain the same target/capture;
  if a publication response was lost, exact manifest/hash comparison recognizes
  the committed capture. A different target head is never overwritten. Resolve
  editor drafts before switching profiles so drafts are not silently discarded.
- **放弃本地进度** asks for confirmation, closes the old runtime and reloads cloud
  history. The next game launch reads that cloud revision.

An externally imported/restored head also pauses the old runtime instead of
silently closing it. A failed editor writeback has a separate retry: the cloud
revision already exists, so retries write that group locally without republishing.

## Multi-file consistency and compatibility

Every edit member is transformed before the single cloud publication. The runtime
checks all base files, downloads/verifies all replacements, then writes the group
while paused. A later failure rolls back every attempted member; rollback failures
keep the runtime paused and require reloading the retained cloud revision.
This is guarded batch recovery, not a crash-atomic filesystem transaction.

New games require verified path declarations and their own format adapters. The
shared transport supports multiple files; it does not infer relationships between
world, character and index files or know when an arbitrary game finishes saving.
Verify related-file completeness and open-handle/cache behavior for each game.
Dynamic file discovery and live creation/deletion are not yet supported by editing.
Do not equate a coherent paused filesystem capture with a completed in-game save.
