# Agent Instructions

Read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and
[platform status](docs/platform/STATUS.md) before changing code. Update the status
when completing a milestone or handing work to another agent.

## Product scope

The project is Rebito · 晚回舟. Keep this name consistent in user-facing text.
Compose uses the `rebito` namespace; upgrades from earlier project names require
explicit data migration as described in `platform/DEPLOYMENT.md`.

Build a single-page retro gaming platform for DOS, FC/NES, SFC/SNES, GB, GBA,
Sega Mega Drive/Genesis, Master System, Game Gear and Mega CD/Sega CD.
Games run in browser emulators. The server owns authentication, private saves,
revision checks and optional game-specific save editing. Koukai2 is the first
editor adapter, not the platform's universal save format.

Early Windows games are planned, not implemented. Retain DOSBox-X assets as a
candidate for Windows 95/98/ME; do not treat them as general Win32 support or reuse
native-file sync for mounted disk writes. See [runtime boundaries](platform/RUNTIMES.md).

Prefer maintained open-source components. Evaluate RomM before rebuilding its
capabilities. Record decisions and evidence; do not assume an integration works
because an upstream documentation page lists a feature.

## Changes and commits

- One independently reviewable change per commit, with its relevant tests/docs.
- During pre-publication history review, fold immediate corrections into their
  owning change; preserve independent behavior changes and verify retained trees.
- Commit messages are one concise Conventional Commits line, at most 72 characters.
- Keep each commit at or below 500 added plus deleted lines. Do not split a change
  into broken intermediate commits or compress code to evade the limit.
- Count all changed lines, including small lock updates, against the 500-line budget.
  Only `platform/package-lock.json` may exceed it in a dedicated single-file commit;
  keep dependency preparation installable and never omit the lockfile.
- The approved AGPL original-text exception is limited to the hash-verified initial
  license copies listed in CONTRIBUTING.md; authored notices still count.
  Introduce each complete legal text in a dedicated, single-file commit.
- Stage explicit paths. Do not use `git add .` or commit unrelated existing work.
- Never commit ROMs, BIOS, game saves, game executables, secrets, downloaded
  dependencies, build output, browser captures or reverse-engineering output.
- Use `codex/` branches. No push to the existing template remote without a separate
  instruction naming the destination.

## Implementation

- Separate platform services, emulator adapters, game manifests and editor modules.
- For editor changes, use the [editor workspace guide](platform/EDITORS.md#working-on-the-editor-workspace)
  to locate the adapter, controls and browser regression. Keep slot groups expanded,
  preserve original game names and preview every file/slot that will be published.
- Keep save transformation independent of HTTP, UI, storage and authentication.
- Model game saves, emulator snapshots and writable file collections separately.
- Workspace synchronization must capture the running game before reloading server
  history. Keep its runtime alive if synchronization fails during an explicit stop.
- A changed cloud head must pause and preserve the local runtime. Never silently
  discard it or rebase its upload; offer a separate profile or confirmed discard.
  See [synchronization](platform/SYNCHRONIZATION.md) for autosave and exit invariants.
- Live DOS edits replace only the declared native file group after verifying each
  member's base bytes. Keep failed writeback paused and retry the published revision; never
  republish or upload stale runtime bytes. File changes do not update game RAM.
- Console memory edits require a paused captured revision and a reviewed runtime
  format. Preserve native-save companions, verify actual load/readback, and keep
  failed writeback paused. Wrapper controls must not bypass workspace pauses.
  Retrying a published edit reuses its original capture and revision.
- Administrators choose game/editor associations; do not gate them on game hashes.
  Validate save structure and edits at use time, preserve unknown bytes and do not
  claim that structural checks prove compatibility with every game edition.
- Keep each save editor in `platform/src/editors/<game>/` with central adapter metadata.
  The [NES live editor](platform/NES-CHEATS.md) uses a browser capability and a
  whole-ROM release digest. Verify named effects in gameplay for every supported
  translation. A successful RAM readback alone cannot establish a game's layout.
- Authorize every private resource on the server and publish revisions atomically.
- Retry save admission failures with the original capture and base revision only.
  Never blindly retry uncertain publication results or rebase a stale upload.
  An aborted client must not free an active upload slot before its write settles.
- Check administrator authority before reading game uploads. Stream bounded archive
  preparation and publish immutable releases; launch/sync changes must not reassign
  existing profiles. Only administrators may change installed editor associations.
- Online deletion must hold the exclusive storage activity lease, recheck the
  confirmed impact, and durably record cleanup before removing history. All live
  handlers/import entrypoints must participate; retries must recheck shared references.
- Enforce personal limits across profiles and site limits across owners in the
  publication transaction. Whole-profile removal must confirm the current head
  and protected history. See the [retention contract](docs/platform/HISTORY_RETENTION.md).
- Preserve the application storage lease when adding entrypoints; offline collection
  must exclude active writers. Read [storage operations](platform/OPERATIONS.md) before maintenance.
  Callers must await `app.close()` before ending the database pool; ending the pool
  inside an app close hook can deadlock against its dedicated storage lease.
- DOS replaces its unprotected head atomically, retaining manual backups and crediting
  the superseded revision at admission. Keep the original base in the publication
  receipt for verified live writeback. Console retention keeps heads, predecessors, recent safety points
  or protected checkpoints. Protect pre-existing history during migration. Recheck
  manual cleanup previews under the exclusive lease and persist file cleanup intent
  atomically with metadata compaction. Drain the history worker before closing its
  lease or removing storage. See [retention](docs/platform/HISTORY_RETENTION.md).
- Prefer OIDC integration; LDAP may be federated through an identity provider.
- Use small cohesive modules, descriptive names and comments explaining invariants.
- Keep the UI compact with neutral slate/blue accents; the user dislikes green
  primary themes. Prefer shared theme tokens over per-control color overrides.
- Keep user-facing text in `platform/client/locales`. Use stable message descriptors
  across server/editor/runtime boundaries; never use translated labels as identifiers.
  Preserve active games, draft values and table state when the language changes.
  English is the fallback; browser preference chooses English or Simplified Chinese.
  See [internationalization](docs/platform/INTERNATIONALIZATION.md).
- Add abstractions only for a demonstrated boundary, not speculative features.
- Use erasable TypeScript syntax so Node can run server sources directly. Keep
  browser build/type checks separate from the server's compiled output.
- Review dependency license changes; run `node scripts/dependency-policy.mjs`.
  See [dependency policy](docs/platform/DEPENDENCIES.md) before upgrading UI/runtimes.
- Preserve project/dependency notices and read [licensing](docs/platform/LICENSING.md)
  before distribution. Original work uses AGPL-3.0-or-later; dependency terms remain
  separate. Publish source only; free hosting still conveys browser runtime copies.
- Runtime upgrades must update the archive-bound `platform/runtime-materials.json`
  review and preserve verified notices/build materials. Read the
  [source review](docs/platform/RUNTIME_SOURCE_REVIEW.md); its excerpts are not
  complete corresponding source or clearance to publish binaries/images.

## Verification

Run the checks for the changed component before committing. Cover malformed data,
ownership, concurrent updates and failures, not only the successful path. Emulation
and persistence require real runtime integration checks in addition to mocks.
Do not describe a mock, documentation review or generated config as a passed
deployment test. Record the exact checks and any remaining limitations.
`npm --prefix platform run lint` checks both application files and root `scripts/`;
keep repository tooling under the same formatting and lint rules.

Keep Chromium's sandbox enabled for both manual validation and browser tests.
Playwright launches must explicitly set `chromiumSandbox: true`; do not work around
startup or feature problems with `--no-sandbox` or other sandbox-disabling flags.

A legacy desktop implementation may exist as uncommitted local reference material.
Preserve it when present; do not reset, move, delete or bulk-commit it during platform work.
