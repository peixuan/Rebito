# Platform work status

Updated: 2026-11-13 (Asia/Shanghai).

## User verification follow-up

- Runtime image security updates are deployed locally: Node 24.22.3 and PostgreSQL
  18.7, pinned by digest across app/test Compose and CI. A stopped-app backup was
  restored into separate volumes before upgrading; all 28 physical files, three
  profiles and 25 revision records match before/after both restore and deployment.
  No public GIN/GiST or bpchar-table indexes needed the release's repair review.
  Readiness passes and the previous app image/consistent private backup are retained.
  Full gates pass
  294 unit/integration tests and 41 sandboxed Chrome tests against PostgreSQL 18.7.

- Stack/redundancy review retains the modular Vue/Fastify/PostgreSQL architecture;
  all 90 production TS/Vue modules are reachable from app/runtime/operator entries,
  and direct dependencies have identified uses. It does not certify zero redundancy:
  at review time, Node 24.22.2/PostgreSQL 18.6 needed newly published security
  patches, frontend directories occupied 41.49 MiB in the server image, and the
  DOS-only adapter shipped 25.32 MiB of unused DOSBox-X assets. Local build-cache
  retention also needed attention. Subsequent remediation is recorded above.
  Review checks passed 292 unit/integration tests, the full
  41 sandboxed Chrome tests, lint/types/build, dependency audit and license metadata
  policy. The existing service/data were not redeployed or pruned. See the dated
  [review and priorities](ENGINEERING_LOG.md#2026-11-13-stack-and-redundancy-review).

- The game panel now displays a compact, expanded player-one keyboard/controller
  guide and a direct control-settings button. The console adapter reads current
  EmulatorJS labels/bindings and reports remap, Clear and Reset changes; the page
  receives an optional runtime capability instead of depending on wrapper internals.
  Remapping is explicitly session-only. DOS has separate keyboard/mouse guidance.
  `npm run check` passes all 292 unit/integration tests, lint, types and production
  build; dependency policy passes. Twelve sandboxed Chrome regressions pass across
  NES (with/without battery), SNES, GB, GBA, MD (raw/SMD), SMS, GG and Mega CD, including
  actual remapped NES input, empty/reset bindings, runtime restart, 390-pixel layout,
  native saves and snapshot restoration. The updated Linux container is healthy;
  prior game/save baseline hashes remain intact. A read-only local acceptance run
  of the operator's Sangokushi III confirms all 12 hints, live remapping and narrow
  layout without changing its revision history or reporting browser errors.
  See [runtime boundaries](../../platform/RUNTIMES.md).

- Mega CD/Sega CD is implemented with region-checked BIOS, streamed CUE/BIN uploads
  up to 1 GiB, no-reupload BIOS changes, private progress and PicoDrive restoration.
  Original firmware tests actual cartridge reads/writes and visible state recovery;
  the operator's Japanese Sangokushi III boots with its BIOS and formatted cart.
  Full gates pass 292 tests; 39 browser regressions plus the BIOS-edit browser test
  pass with Chromium's sandbox enabled. The real 497 MiB package uploads through
  the 512 MiB Linux container in 39 seconds. Native import follows the core's correct
  allocation sequence; complete progress retains both state and cartridge. Full
  app/database restart preserves the new head/artifacts and all 29 original saves.
  The game and a validation profile are deployed locally. See
  [game acceptance](GAME_ACCEPTANCE.md) and [runtime boundaries](../../platform/RUNTIMES.md).

- Sega MD/Genesis, Master System and Game Gear are implemented using one pinned
  Genesis Plus GX core. Shared system metadata drives uploads/catalog labels;
  core/save-path/control bindings remain in the runtime adapter. Bounded header
  checks reject malformed/wrong-model images without changing cartridge bytes.
  Real sandboxed Chrome tests cover raw/SMD MD, SMS and GG: keyboard input, correct
  MD button labels, native SRAM import and visible state restoration. The core
  omits SRAM from states, so snapshot revisions retain both artifacts. Web uploads,
  account saves, stop/resume and cross-account download denial pass for each format.
  Snapshot identities now depend on each core/wrapper while preserving the original
  unchanged-binary baseline; adding this core does not invalidate other games.
  Runtime noncommercial/component terms were reviewed and recorded in dependencies.
  Full gates pass: 272 unit/integration tests and 37 browser tests. Container build
  and an isolated Linux probe pass four uploads and exact native-save recovery after
  app recreation. Local app recreation is healthy; the deployed administrator page
  exposes all three models and the 390-pixel layout has no horizontal overflow.
  Existing game bytes and all 27 recorded save downloads match the pre-upgrade
  digests. Synthetic cartridges remain confined to disposable test libraries.
  Original test programs
  establish these runtime paths, not universal commercial-ROM compatibility.
  The existing inventory test now compares whole-file bytes natively, avoiding its
  timeout without reducing exhaustive cases or relaxing the quality gates.

- Configuration editing and confirmed deletion are implemented and deployed locally.
  The form reuses stored assets: renaming preserves the release; changed DOS launch
  or sync rules publish a new immutable release without migrating old profiles or
  inheriting an unverified editor binding. Fresh configuration tokens reject stale
  edits, including a catalog renamed before the administrator opens its editor.
  Deletion shows affected users/profiles/history and estimated physical recovery,
  requires an exact title plus explicit consent for all related saves, and rejects
  a preview invalidated by new progress. Cleanup intent and history removal commit
  together; catalog removal precedes unlinking. Shared blobs/assets are rechecked on
  retry. Pending cleanup is visible, blocks new imports and is retried at startup.
  Private HTTP handlers and the import CLI share an online storage activity lease;
  reclamation takes its exclusive counterpart across instances. Tests cover active
  readers/writers, fairness, stale consent, interrupted unlink and later blob reuse.
  Profile creation now requires an available catalog release. CLI imports require
  the initialized deployment database and participate in both storage leases.
  Full gates pass: 263 unit/integration tests and 29 sandboxed Chrome tests. Browser
  acceptance runs a reconfigured DOS release, checks native save bytes and keeps
  the local runtime when deletion prevents further synchronization. Linux container
  API/filesystem acceptance deleted two synthetic profiles, reclaimed 32,788 bytes,
  retained shared bytes and survived app recreation. Both local services are healthy.
  The existing library and all 27 recorded save downloads match their pre-upgrade
  values; no real game/progress was deleted. A stale publisher `.import.lock` still
  requires operator inspection; backups and host virtual-disk compaction remain
  separate from reclaiming files inside the data filesystem.

- Administrator game management is implemented and deployed locally. The header
  opens uploads, DOS launch settings, explicit save paths and a searchable/sortable
  release list. Stable account-ID allowlisting defaults to no administrators and
  is checked before reading uploads; the existing local acceptance account is enabled.
  Games publish without a container restart. Configuration changes publish a new
  immutable DOS release; existing profiles and verified editor bindings stay intact.
  Browser ZIP inspection reads metadata only; server repackaging streams files and
  validates paths, collisions, sizes, encryption, file types and CRCs. Declared saves
  are excluded from shared packages. Uploads are limited to 64 MiB, DOS expansion to
  256 MiB, and retained library assets to a configurable 10 GiB under the import lock.
  Failed/disconnected uploads clean staging; offline collection handles abandoned
  staging under its exclusive lease and never deletes published games.
  All local gates pass: 251 unit/integration tests and 27 sandboxed Chrome tests.
  Uploaded DOS and NES fixtures run in real emulators; DOS publishes two exact
  native files including a nested path. Failed synchronization blocks navigation
  to management and preserves the runtime. Tests also cover role/origin rejection,
  draft retention, actual HTTP disconnect cleanup/retry, quota and concurrent uploads.
  The rebuilt Linux containers are healthy; a real container probe verifies streamed
  DOS preparation and save exclusion. Three existing save downloads retain identical
  digests. Browser upload acceptance uses the local test server, not the production
  catalog, which still contains only the verified Koukai2 release. Arbitrary game
  compatibility is not claimed; configuration/deletion follow-up is recorded above.

- Capacity review: blob writes now leave a configurable 1 GiB free-space margin,
  count this process's pending writes, and return a distinct recoverable 507 error.
  Full local checks pass (210 tests); actual filesystem probes plus PostgreSQL
  verify that a rejected upload leaves the old head and bytes intact. Simulated
  disk probes cover concurrent reservations and late ENOSPC/EDQUOT failures.
  Compose bounds app/database logs to three 10 MB files per container. This is
  not a global filesystem quota or automatic history pruning; see operations.
  The rebuilt app/database containers are healthy and both report the bounded local
  log driver. A real Linux filesystem probe verifies refused writes, intact old
  bytes and temporary-file cleanup. Three recorded save artifacts match their
  pre-recreation digests through the authenticated download API.
- The compact slate/blue shell now shows per-account bytes, revisions and profiles,
  updates after save/profile changes, warns at 80%, and labels stale usage after a
  failed refresh. It removes the repeated welcome section and retains the temporary
  name at the user's request; see the presentation rationale in architecture.
  No dependencies or services were added. Lint/types/build and all 24 sandboxed
  Chrome checks pass, including real usage updates/account isolation, narrow layout,
  simulated capacity-warning display and a disk-full response during real DOS play.
  The DOS failure retains the runtime and successfully retries before logout.

- Multi-file follow-up: the runtime now validates a complete replacement group
  before writing, rolls back every attempted member on failure, and keeps trying
  other rollbacks if one recovery fails. Fourteen focused unit checks and both
  real DOS browser checks pass, including two files and a nested path. Cloud
  batch publication now also passes seven service checks, including a failed
  second blob and concurrent writers. The UI now publishes all pending files/slots
  together. Ten coordinator/editor API checks and four browser checks pass, including
  two-file publication and live replacement. Unknown game formats still require
  their own adapter. DOS now checks native-file changes every 30 seconds, and saves
  before library navigation/logout. Three change-detection/transport unit checks
  and real DOS automatic publication/navigation checks pass. Conflict recovery now
  preserves the runtime and offers a separate private profile or confirmed discard.
  Two focused recovery unit checks and real concurrent-writer browser checks pass,
  including a lost publication response. Forced termination still risks the latest
  unsynced work; see [synchronization](../../platform/SYNCHRONIZATION.md).
- Chromium sandboxing is now explicitly enabled for manual validation and E2E.
  All 23 browser checks pass, including a launch check that rejects
  sandbox-disabling arguments. The visible Windows Chrome process and
  its renderer/GPU processes were checked without `--no-sandbox`.
- Live DOS editor writeback now replaces only the edited native file group without
  restarting the emulator. Preflight rejects unsynchronized game saves before
  publication; verified writes preserve other files and the previous pause state.
  Failed writeback stays paused and retries the existing revision, blocking stale
  uploads. File-I/O and coordinator checks cover group guards, corruption and
  rollback; worker writes receive copies because transfer detaches buffers.
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
- All 24 browser checks pass after these changes. The DOS synchronization test
  observes the real filesystem read-only and waits for the complete expected file
  before clicking refresh, avoiding a race with the emulator's keyboard queue.
  After editor saves it waits for completed writeback before observation: js-dos
  rejects concurrent reads of the same file, including reads by test instrumentation.
  The updated image is deployed locally; no remote push or CI run was performed.
  On that image, real Koukai2 remained running for 51 seconds without publishing
  unchanged native data; Stop then published a complete revision with identical
  native bytes. External imports now require explicit conflict resolution.

## Target

A container-deployable single-page gaming platform for DOS, FC/NES, SFC/SNES, GB,
GBA, Sega MD/Genesis, Master System and Game Gear, with login, isolated versioned
saves and optional server-side game editors.
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
| Administrator game management | Verified and deployed locally | Role-checked uploads; DOS launch/save settings; live catalog refresh; quotas; real uploaded DOS/NES/MD/SMD/SMS/GG fixtures |
| Configuration and game deletion | Verified and deployed locally | No-upload editing; confirmed cross-owner deletion; stale-impact rejection; shared-reference-safe file recovery and retry |
| DOS browser runtime | Fixture and real game verified | DOSBox WASM, native files, filesystem overlay, edited-byte precedence; relative mouse capture/Escape release |
| Console browser runtime | Six cores verified with own fixtures | NES/SNES/GB/GBA/MD/SMS/GG/CD memory and states; keyboard, visible restoration, SMD, no-battery snapshots and BIOS/cart initialization |
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
  input are available. Six console cores are exercised with original test programs,
  not every commercial release. Koukai2 compatibility is tied to the verified format.
- Save history is retained and quota-limited; automatic pruning and arbitrary
  third-party editor plugins are not part of this implementation.

## Available checks

`node --test scripts/*.test.mjs`: 10 tests passed locally.
`node scripts/dependency-policy.mjs`: 280 locked packages reviewed.
Enable local hooks with `git config core.hooksPath .githooks`.
The `platform` workflow checks every new commit since the pre-platform baseline;
remote CI has not run because this work has not been pushed.

`cd platform && npm run check` with the test database: format/lint, TypeScript,
HTTP/domain/filesystem and real PostgreSQL identity/revision/service tests passed.
The complete run passed 292 tests with 97.99% Windows line coverage, 92.28% branch
coverage and 97.98% function coverage. Linux-only directory fsync is exercised by
deployment, not by Windows unit coverage. The process entrypoint and account-provisioning CLI
are excluded from unit coverage and exercised by the container smoke test.

The complete 39-test browser suite plus the BIOS-edit test pass, including six console cores, DOS,
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
