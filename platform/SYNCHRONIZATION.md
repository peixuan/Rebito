# Save synchronization and recovery

The platform stores a revision of a file collection, not a universal game save.
A DOS manifest declares portable native save paths in `saveFiles`, including
subdirectories. Captures include existing declared files and the runtime overlay;
editors replace a validated group while reusing untouched cloud artifacts.

## Automatic and explicit saves

DOS checks approximately every 30 seconds. A new version is published only when
declared native file bytes, names or membership differ from the running base.
Archive-only differences do not create automatic history entries. Explicit
**Synchronize and refresh**, Stop, library navigation and logout capture the full collection.
All publication paths use the same ownership checks, quotas and revision guard.

This uploads files already saved by the game. It neither presses the game's save
command nor records DOS RAM. Automatic checks first observe declared files without
pausing or compressing the overlay. These reads are only change hints and never
published: if changed, a fresh paused capture copies the complete collection and
rechecks the native group. Writes after an unchanged observation wait until the
next check. There is no claim of a game-level save transaction.

Automatic saves resume a previously running game as soon as the owned capture is
complete, before hashing/upload/retries. Later game writes remain local until the
next capture; success advances the base only to the uploaded snapshot. Manual
saves/exits remain paused through publication. A user-paused game stays paused.
Any observation, capture or upload failure pauses and preserves the current
runtime, including play made during the upload. A changed cloud head immediately
pauses it even while an upload is pending; the original revision guard still applies.
Background browser throttling may delay timers; closing the page does not complete
an asynchronous upload. A before-unload warning protects normal reload/close, but
forced termination or power loss can lose changes after the latest successful sync.
There is currently no durable offline browser outbox.

Save uploads share a per-process FIFO queue: two active collections, eight waiting
requests and at most 15 seconds waiting for admission. Waiting multipart streams
remain unread, keeping the two-upload memory bound. Overflow/expired waiters receive
`503 upload_busy` with `Retry-After`; they have not started publication. Disconnects
remove waiting requests but never free an active slot before its write settles.
Every admitted save still checks ownership, quotas and the original base revision.

Browser captures and file imports automatically retry only `503 upload_busy`, at
most four retries, with exponential backoff, jitter and the server's `Retry-After`
minimum. A retry is not scheduled beyond 60 seconds from the initial request;
an already admitted request may take longer to finish. All attempts reuse the
same captured bytes and base revision. Pending saves keep controls busy to prevent
overlapping captures/edits; automatic uploads may keep the runtime running as above.
Successful autosaves/exit saves proceed without another click.
Exhaustion preserves the runtime/files for an explicit later attempt. Conflicts,
quota/authentication errors, network failures and invalid responses are not
automatically retried: a lost response can hide a successful publication. Never
refresh the base and silently overwrite a newer head to make a retry succeed.

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

## Console memory editing

Supported console editors modify a paused emulator checkpoint. Return to the
game's supported field or strategic menu, then choose **Capture for editing**.
The capture remains paused after publication. Changing language or navigating
editor records preserves the draft; resume, upload and stop remain blocked while
a console draft is pending. The editor displays its game-specific instructions.
Input remains disabled until a paused capture of the current cloud revision has
finished. Resuming, loading an edited state, a conflict or restarting the runtime
ends that editing session. Capture again before the next edit; a late capture
response cannot reopen an invalidated session. Reading records and discarding
a draft remain available, and exact byte verification is still required at publication.

Before publishing an edit, the browser verifies every captured artifact against
the selected revision, including native SRAM. The server authorizes the owner,
checks the installed editor and exact reviewed runtime identity, extracts the
editor's memory domain, transforms it and replaces only `__runtime/state.bin`.
Companion artifacts remain unchanged in the same atomic revision. Existing
ownership, storage leases, quotas and compare-and-swap checks still apply.

The browser downloads and verifies the published state. The pinned cores queue
state loading, so writeback briefly advances the core, pauses again, then checks
the changed bytes and surrounding scalar bytes plus every native companion.
Unrelated state may advance during those frames. Ignored loads, changed values,
download failures and timeouts retain the published revision and a paused game.
Retry uses that same revision and original capture; it does not republish, rebase
or capture stale local bytes. A known newer cloud head prevents automatic resume.
Wrapper play controls and local quick-state shortcuts cannot bypass this pause.

A checkpoint edit changes RAM, not the game's native save. Use the game's own
save command after resuming to retain changes there. Mega-CD internal BRAM and
RAM cartridge files remain distinct; keep both checkpoint artifacts. This path
does not provide arbitrary browser memory writes or support unreviewed cores.
