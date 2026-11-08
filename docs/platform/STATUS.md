# Platform work status

Updated: 2026-11-08 (Asia/Shanghai).

## User verification follow-up

- Chromium sandboxing is now explicitly enabled for manual validation and E2E.
  All 19 browser checks pass, including a launch check that rejects
  sandbox-disabling arguments. The visible Windows Chrome process and
  its renderer/GPU processes were checked without `--no-sandbox`.
- Live DOS editor writeback now replaces only the selected native file without
  restarting the emulator. Preflight rejects unsynchronized game saves before
  publication; verified writes preserve other files and the previous pause state.
  Failed writeback stays paused and retries the existing revision, blocking stale
  uploads. Seven file-I/O unit checks and four coordinator checks cover guards,
  corruption and rollback; worker writes receive copies because transfer detaches buffers.
  Real DOS readback and browser checks cover exact bytes, pause state and retry.
  Real Koukai2 on the updated container retained its runtime across consecutive
  edits, with complete native/cloud bytes restored afterward. Load the save inside
  the game to update game memory; external imports/restores still invalidate it.
- DOS defaults to integer device-pixel scaling, with a fit-to-window toggle and
  nearest-neighbor sampling. The real DOS browser checks cover non-integer window
  sizes, toggling, palette preservation and pointer capture. Lint/types and both
  DOS integration tests pass. This changes display scaling, not game CPU settings.
- While a game runs, workspace refresh now captures and publishes its live files
  before refreshing history and the editor. Explicit Stop also publishes first;
  a failed upload keeps the paused runtime available for retry. Dirty editor drafts
  survive publication and require explicit reloading. Real DOS shell writes verify
  exact downloaded bytes, updated fields, retained drafts and failed-stop recovery.
- Primary controls now use neutral slate tones with blue links instead of green.
  Lint, types and the container build pass; the deployed theme was inspected in
  Chrome. The real Koukai2 canvas was verified at 640 × 480 source/display pixels.
- All 19 browser checks pass after these changes. The DOS synchronization test
  observes the real filesystem read-only and waits for the complete expected file
  before clicking refresh, avoiding a race with the emulator's keyboard queue.
  After editor saves it waits for completed writeback before observation: js-dos
  rejects concurrent reads of the same file, including reads by test instrumentation.
  The updated image is deployed locally; no remote push or CI run was performed.

## Target

A container-deployable single-page gaming platform for DOS, FC/NES, SFC/SNES, GB
and GBA, with login, isolated versioned saves and optional server-side game editors.
The first editor reproduces the existing Koukai2 capabilities. Runtime and editor
support are separate: a playable game need not have an editor.

## Workspace facts

- Branch: `codex/retro-web-platform`.
- Remote still points to `peixuan/project-template`; do not push there.
- Existing C++/wxWidgets implementation and its documentation are pre-existing
  uncommitted local work. Preserve them as migration evidence, not new platform commits.
- Original game data: `<operator-game-directory>`; read-only for this project.
- Private development evidence and upstream checkouts belong in `.analysis/`.
- Docker Desktop fails locally; an independent WSL Ubuntu Docker Engine now runs
  PostgreSQL 18.6 integration and application containers. Windows Docker Desktop
  files were not changed to make this work.

## Milestones

| Milestone | Status | Acceptance |
| --- | --- | --- |
| Engineering rules and commit gates | Implemented | Hooks and CI enforce subjects, artifacts and line budgets |
| Upstream reuse decision | Recorded | See [architecture](ARCHITECTURE.md); reuse runtimes/auth libraries |
| TypeScript service skeleton | Verified locally | Format, lint, types, 9 route tests, coverage and build pass |
| Progress collection contract | Verified locally | Native saves, snapshots and filesystem collections; portable paths and bounds |
| Private blob storage | Verified on Windows/Linux | Exact bytes, concurrency, corruption detection; Linux publication and restart |
| Identity API | Verified locally | PostgreSQL migrations; password/session lifecycle; CSRF; closed registration |
| OIDC integration | Verified in Chrome | Independent provider; code flow/PKCE; isolated users; tampered state/nonce rejected; LDAP federation documented |
| Container application | Verified locally | Non-root app; restricted database role; real login and save bytes survive full restart |
| Revision repository | Verified locally | Real PostgreSQL ownership, concurrent writers, rollback and immutable history |
| Save service | Verified locally | Durable blobs before publication; guarded download; non-destructive restore; storage failures |
| Save publication API | Verified locally | Real multipart imports, private downloads, stale writes, history and restore |
| Storage bounds and maintenance | Verified locally | Per-owner quotas under concurrent writes; exclusive offline verification/collection; no history deletion |
| Browser login shell | Verified in Chrome | Real registration/login/logout, session recovery and narrow-viewport checks |
| Game library and personal progress | Implemented | Verified assets; private catalog API; browser import, history, restore and account isolation |
| Operator game preparation/import | Verified locally | Explicit DOS file allowlist; deterministic bundles; atomic catalog publication; source files unchanged |
| DOS browser runtime | Fixture and real game verified | DOSBox WASM, native files, filesystem overlay, edited-byte precedence; relative mouse capture/Escape release |
| Console browser runtime | Four cores verified with own fixtures | NES/SNES/GB/GBA SRAM and states; NES keyboard, volatile palette and no-battery snapshot restoration |
| Koukai2 editor | Real-game round trip verified | Eight modules; 13/13 legacy matches; browser editing/conflict tests; game reads and resaves modified money/leadership |
| Local acceptance | Verified | Gates, end-to-end flows, complete container restart and fresh-volume backup recovery pass |

## Acceptance boundaries

- Distinguish native game saves, emulator states and writable file collections.
- Version snapshots against game release and emulator core where applicable.
- Back-end identity determines ownership; never trust a submitted user identifier.
- An edited save becomes a new revision. Stale game uploads cannot overwrite it.
- Use established emulator and authentication libraries. Prefer OIDC; demonstrate
  the documented LDAP federation route without requiring an LDAP server for everyone.
- Do not make supported-system claims from mocked adapters alone.

## Handoff and release boundaries

The requested local implementation and acceptance are complete. Start with
[deployment](../../platform/DEPLOYMENT.md), [game imports](../../platform/LIBRARY.md)
and [storage operations](../../platform/OPERATIONS.md). No games, personal saves,
credentials or downloaded emulator archives are committed.

- No push or remote CI run has occurred; choose the actual destination first.
- Before publishing a project release, complete the runtime
  redistribution/source-material obligations in [dependencies](DEPENDENCIES.md)
  and [runtimes](../../platform/RUNTIMES.md). Noncommercial intent alone does not settle these.
- Production TLS and the actual identity provider/LDAP directory remain operator
  configuration. The local OIDC acceptance uses an independent test provider.
- DOS absolute pointer alignment depends on the game; relative capture and keyboard
  input are available. Four console cores are exercised with original test programs,
  not every commercial release. Koukai2 compatibility is tied to the verified format.
- Save history is retained and quota-limited; automatic pruning and arbitrary
  third-party editor plugins are not part of this implementation.

## Available checks

`node --test scripts/*.test.mjs`: 10 tests passed locally.
`node scripts/dependency-policy.mjs`: 274 locked packages reviewed.
Enable local hooks with `git config core.hooksPath .githooks`.
The `platform` workflow checks every new commit since the pre-platform baseline;
remote CI has not run because this work has not been pushed.

`cd platform && npm run check` with the test database: format/lint, TypeScript,
HTTP/domain/filesystem and real PostgreSQL identity/revision/service tests passed.
The complete run passed 186 tests with 98.26% Windows line coverage, 95.67% branch
coverage and 99.51% function coverage. Linux-only directory fsync is exercised by
deployment, not by Windows unit coverage. The process entrypoint and account-provisioning CLI
are excluded from unit coverage and exercised by the container smoke test.

The complete 19-test browser suite passes, including all four console cores, DOS,
OIDC and three editor tests: exact multi-slot output bytes, numeric sorting and
selection retention, clamping/invalid-input handling, narrow layouts, and retaining
drafts when another upload advances the revision head. Edited cells update without
reordering the selected row until the next explicit sort. The no-battery NES test
restores a changed visible palette from a snapshot without a native save file.
The DOS player checks pointer capture and Escape release in the real runtime.

Container verification used the pinned Node 24/PostgreSQL 18 images in WSL:
image build, healthy startup, stdin account creation, login/logout, multipart save
upload/download, full app/database restart, and exact saved-byte recovery passed.
The app UID is 1000; the database role has no superuser/create-role/create-db rights.
CI repeats build, startup and persistence smoke, but has not run remotely.
The final image includes the runtimes, editor and relative mouse support. Real
Koukai2 save editing/playback and backup recovery into separate fresh volumes also
passed; see [game acceptance](GAME_ACCEPTANCE.md). Production dependency audit
reported zero known vulnerabilities at the time of this local acceptance.

## Existing evidence

The desktop implementation documents 13 whole-file comparisons with the original
editor in `docs/VALIDATION.md` (currently local, not committed). Those examples are
useful regression evidence, not complete game compatibility proof. Preserve the
independent expected-byte checks as well as comparisons with the C++ implementation.
