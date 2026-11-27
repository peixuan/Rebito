# Platform work status

Updated: 2026-11-27 (Asia/Shanghai).

## Library and site appearance

The same Vue application serves phones, tablets and desktops. The site header
and shared theme tokens control day and night views across accounts, the library,
the player workspace, editors and game management. A manual theme choice
persists in the browser. Keep a single selected profile form when changing
layout so resizing the window preserves an unfinished name.

The game screen shares the workspace with a keyboard guide on wide displays.
Narrow displays keep the screen and touch controls together above the guide.
The player controls regression checks both layouts with a running cartridge
and a remapped key, including a theme change during play.

The library prioritizes personal playthroughs and recent additions. Search and
platform filters cover the entire catalog. Administrators can attach an image
to a published release independently of its game file and saves. Keep artwork
inside the existing data volume and include it in deletion previews. See the
[library guide](../../platform/LIBRARY.md#release-artwork) for limits and the
[cover API](../../platform/API.md#game-covers) for authentication and conflict handling.

The browser regressions for cover publication, slow transfers, paging, theme
persistence and responsive profile selection live in `library-covers.spec.ts`
and `library-shelf.spec.ts`. Verify both views with a real stored image and
with a release using its default medium illustration.

## NES live cheats

The NES player can apply session rules, search its 2 KiB of CPU RAM and import
or export local RetroArch cheat lists. Keep UI code in `platform/client/nes-cheats`
and cartridge parsing and presets in `platform/src/editors/nes`. The capability
is scoped to one running cartridge and the pinned FCEUmm build. See the
[NES editor guide](../../platform/NES-CHEATS.md) for adding verified releases.

Local acceptance exercised uploads, gameplay edits, saving and resuming on
20 exact releases. Nineteen used built-in presets across 15 games. Dragon
Warrior used a portable two-byte gold rule that changed the displayed balance
to 500 and 1,000 in the castle. The committed tests use original homebrew
fixtures, including conditional and unconditional Game Genie reads.

An extended local boot survey covered 12,514 distinct cartridge files.
It exposed an empty mapper record on two Sachen titles. Both now return the
correct RAM and pass the two-value readback. Boot evidence alone does not
establish a game-specific effect or complete playability. Keep game files,
captured states and private collection reports out of Git.

The milestone passed 977 unit and database tests, 98 full-suite browser
scenarios and the additional Game Genie cartridge regression. The 20 local
release checks ran through the player with Chromium's sandbox enabled.

## Touch input

The player offers a collapsed controller and a DOS keyboard next to the game.
Bindings, hold/release handling and emulator-specific input belong in the client
runtime. Keep touch input out of save formats and the server. See
[runtime controls](../../platform/RUNTIMES.md#controls) and the
[touch browser tests](../../platform/tests/e2e/touch-controller.spec.ts).
Touch-enabled Chromium exercises a real NES frame, an original-layout six-button
Mega Drive pad on a 320-pixel phone and a DOS command entered entirely on screen.
The pad stays beside the image in short landscape windows. Local acceptance passed
933 unit/database tests and all 97 browser tests with Chromium's sandbox enabled.
Physical iOS and Android devices remain untested.

## Save limits and DOS backups

Game management now exposes persistent site/account save quotas with optimistic
concurrency. Host disk reserve remains an operator setting. DOS publications
replace the ordinary working head atomically, while manual backups and pre-upgrade
versions survive. Console retention is unchanged. See the
[retention contract](HISTORY_RETENTION.md) and [configuration](../../platform/CONFIGURATION.md).

Local PostgreSQL tests cover replacement at both hard limits, failed and racing
writes, migration and full-group restoration. Browser regressions cover a real DOS
backup, subsequent saves, restart, restore and removal, plus the admin settings dialog.

The previous production release was exercised with a disposable Koukai2 profile.
Publishing its complete native file group and an edit, then deleting the profile,
returned two versions, 1,316,204 logical bytes and 328,991 unique file bytes.
All six original profiles, 66 revision records and 91 referenced blob digests matched.

## Editor workspace and personal saves

The editor workspace keeps records, field groups and save actions visible together.
Repeated martial arts, techniques and skills share section navigation. Combat totals
in Phantasy Star IV are distinct from editable base values. Draft preview includes
every edited file and slot. See the [editor handoff](../../platform/EDITORS.md#working-on-the-editor-workspace)
for the five adapters, their data boundaries and the matching browser fixtures.

The Mega CD SAN3 editor shows all eight modules grouped by strategy, battle or
officer registration. Unavailable modules share the reason within each phase.
Editable sections precede read-only references for the selected record. The layout
regression covers phone, tablet and desktop widths, switching languages with a
draft, and writing the edited city and officer back to the paused PicoDrive core.

Players can remove a whole profile from the library, including an empty profile or
one whose game data cannot be opened. Confirmation names the profile and counts
protected revisions. Concurrent saves or protection changes invalidate that
confirmation. Site defaults are 10 GiB and 10,000 revisions, alongside 2 GiB,
2,000 revisions and 100 profiles per account. See the
[retention contract](HISTORY_RETENTION.md) for accounting, rotation and disk cleanup.

Local verification used disposable PostgreSQL, synthetic save data and sandboxed
Chrome. Five accounts simultaneously published different 1 MiB saves at a 5 MiB
site limit. All five downloads matched their submitted bytes, and the next write
returned 507. A separate run removed a profile with a missing blob, rejected a
stale confirmation, retained the other owner's data and reused the released quota.
The local suite passed 929 unit and database tests and all 93 browser regressions.
Production rollout and operator-selected disk budgets are separate deployment steps.

## Reviewed source and history

The owner authorized a baseline-preserving replay and a follow-up review of public
main `b927ddc`. Preserve exact baseline `a20553aa`, contributor identity and unrelated
desktop changes. Never publish recovery refs, diagnostics or downloaded assets.
Original source dates are restored; 33 split parts use recorded ordering offsets
of at most 36 seconds, while all 109 source anchors remain unchanged. Both author
and committer sequences still advance at least three seconds. See the
[timestamp ledger](REPLAY_TIMESTAMPS.tsv); offsets are not original edit times.

The 159 source commits and six added dependency preparations were checked for
chronology, scope and size. License corrections and stricter size gates are folded
into their owning changes, with source author/committer metadata retained.

The interface supports English/Simplified Chinese, browser selection with English
fallback and a persisted manual choice. Stable message descriptors separate
translation from services/editors. Switching language preserves games, drafts and
table state. README instructions and source/comments are English; Chinese application
text lives in locale resources. See [internationalization](INTERNATIONALIZATION.md).

The replay contains 142 independently reviewable changes, with at most 495
added/deleted lines each outside dedicated license/lockfile commits.
Windows Node 26 and Linux Node 24 passed
376 tests, lint, types and builds; all 48 sandboxed browser flows passed together.
Historical builds and database suites cover 108 distinct application inputs;
changed historical policy inputs and the current 26-test policy suite pass separately.
Both complete legal texts are introduced in single-file commits. Intermediate
DOS/i18n and storage-UI flows pass three and seven real browser tests respectively. The [source review](OPEN_SOURCE_REVIEW.md)
records the exact scope and limitations. Require passing checks for the exact
published commit; [GitHub Actions](https://github.com/peixuan/Rebito/actions) is the
live hosted acceptance record.

## Implemented boundaries

SAN3 navigation now keeps all eight feature modules visible across strategic,
battle and registration captures. Unavailable modules explain the required phase;
the server still rejects cross-phase requests. Record-level operations remain
visible with disabled, valueless placeholders when their prerequisites fail.
The compact layout keeps sections expanded, adds direct section links, separates
common settings from read-only context, and puts batch controls above the fields.
Shared field guidance is deduplicated without removing its accessible descriptions.
The local candidate passed 881 unit/database tests (98.98% line, 95.10% branch),
lint, types, build and dependency audit. Its sandboxed real-core layout flow checks
English/Chinese drafts, 1280/768/390-pixel layouts, paused writeback and unchanged
native saves. Hosted checks and production preservation still gate promotion.

Rebito uses TypeScript, Vue, Fastify and PostgreSQL. Games run in browsers; the
server owns identity, private revisions, game management and optional pure editors.
See [architecture](ARCHITECTURE.md).

- DOS, NES, SNES, GB, GBA, MD, Master System, Game Gear and Mega CD adapters have
  real browser tests with original generated programs, not universal compatibility.
  Snapshots remain bound to their game and emulator identities.
- Koukai2 has eight modules, expected-byte tests and 13 private legacy whole-file
  comparisons. Proprietary samples and executables are not distribution fixtures.
- Admin uploads, launch/save configuration, updates without upload and confirmed
  deletion use storage leases, shared-reference checks and durable cleanup.
- Administrators associate installed editors without executable fingerprints or
  edition allowlists. Save structures/fields are validated at use time; profiles
  remain stable and open editors recheck associations before publication.
- Password sessions and OIDC/PKCE have independent-provider acceptance. LDAP is an
  external identity-provider federation option, not a built-in password service.
- `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` bootstrap one stable admin with
  serialized startup. Restarts cannot adopt an ordinary account or replace credentials.
- Two active uploads and eight queued requests bound save admission. Retries keep
  original bytes/base revisions; conflicts and uncertain results preserve progress.
  DOS edits replace declared native files, without updating game RAM. Read
  [synchronization](../../platform/SYNCHRONIZATION.md).

Windows games, persistent offline upload queues and arbitrary third-party editors
are not implemented. DOSBox-X remains a future
Windows 95/98/ME candidate, not evidence of general Win32 support.

## Bounded personal save history

The per-account default is 2 GiB of logical history; the cloud deployment's earlier
512 MiB override was raised to match it, with existing saves verified unchanged.
Ordinary revisions now rotate automatically: ten recent points, seven daily samples
and four weekly samples, with earlier compaction above 80% of the byte/revision
budget. Current heads, their actual predecessors, recent safety points and manually
protected checkpoints survive. Existing history is protected on first migration.
These guarantees take priority over space reduction; hard quotas and the free-space
reserve still reject writes rather than deleting protected progress.

The bilingual workspace supports protection, confirmed removal of protection,
older-history pages and exact cleanup previews. Transactional metadata compaction
and durable file reclamation share the existing storage activity lease; retries
recheck references across all accounts. Interrupted unlinking is reported separately
from committed history cleanup. No extra service, dependency, compression chain or
runtime restart is introduced. See [retention](HISTORY_RETENTION.md) and
[operations](../../platform/OPERATIONS.md).

All 554 database/unit tests, lint, types and production build pass; overall coverage
is 98.56% lines and 94.41% branches. Focused real-DOS acceptance covers repeated
captures, automatic rotation, cleanup during play, restart and protected-point
restore. API checks cover stale previews, ownership, shared files, concurrent writes,
transaction rollback and interrupted physical reclamation. Browser checks also cover
bilingual previews and checkpoints older than the first 100. Full browser/hosted
checks and production preservation acceptance remain required for the exact release.
Delayed-history regressions keep restart and editor input disabled while a published
head is still loading; a capture also locks editor input until its base is available.
This prevents a local save from being mistaken for a foreign update after restart.
Stopping also locks history restores and imports until its capture, publication
and runtime shutdown finish. A real-DOS regression holds the publication response
after commit and verifies that a subsequent restore uses the new head. Ordinary
background synchronization retains its existing concurrent-import conflict handling.

## Original DOS Sangokushi Eiketsuden editor

The `eiketsuden` adapter supports the original Traditional Chinese DOS format:
five paired MSAVE/ESAVE slots, character levels, experience, troop classes, eight
item slots and campaign money. Base abilities and stored troops remain read-only;
event state and unknown bytes are preserved. Uploaded `BAKDATA.R3` supplies names
and reference abilities through a bounded metadata parser. The compact bilingual
UI reuses the existing editor table, field controls and revision workflow. See
[setup, format and evidence](../../platform/src/editors/eiketsuden/README.md).

Native editor groups now include required companions in guarded live writeback.
Missing pairs cannot be published; an orphaned slot does not hide complete slots.
The private original game retained nine representative edits after loading and
saving again. All 915 local unit/database tests pass (99.01% line, 95.09% branch),
along with lint, types, production build, dependency audit, the Eiketsuden browser
flow and the shared real-DOS synchronization regression. Complete browser, hosted
checks and deployed save preservation still gate promotion of the exact revision.

## Original DOS Heroes of Jin Yong editor

The `jinyong` adapter adds characters, ten learned-art slots and inventory/silver
for the original 114242-byte R1/R2/R3.GRP format. MODs and remakes are outside scope;
record validation is not proof of provenance. The registry supplies administrator
association and bilingual guidance. Native filename filtering excludes RANGER.GRP;
S/D companions and unknown bytes remain intact. There are no new dependencies,
HTTP endpoints or persistence paths. See [setup and evidence](JINYONG_EDITOR.md).

The character view also shows the original sex/castration flag read-only. Inventory
defaults to held items with quantities and actual positions; position edits and
move buttons reorder item/quantity pairs without changing amounts. Table sorting
remains display-only. Canonical drafts compose ordering, additions and removals
against one base revision, with atomic publication and the existing conflict checks.

All 427 database/unit tests pass, with 98.23% line and 93.53% branch coverage overall.
Lint, browser/server types, production build, focused browser editing and private
real-DOS edit/load/save checks pass. The browser flow covers three native saves,
two-file drafts, language switching, input clamping, sorting and complete companion
preservation. Shared choice controls now expose their translated accessible names.
The private original game retained ten representative edits after reloading and
saving again; no proprietary fixture or downloaded editor code is distributed.
The follow-up original-game check confirmed the castration flag after accepting
the game's own prompt, displayed a moved item in the first bag slot and retained
the new order on save. A separate 500-operation mixed-draft check retained order,
quantities, replay and unrelated bytes. Generated tests cover malformed ordering,
cancelled additions, stale concurrent writers and failed multi-file batches.
Every release still requires the complete browser suite, hosted checks and deployed
save-preservation acceptance for its exact revision, without weakening any gate.

## Console memory editors

A full-browser review exposed an unconfirmed PicoDrive load. Investigation
independently reproduced the pinned wrapper's temporary-file cleanup race: an old
timer can remove a newer queued load. The console adapter now owns and cancels
that cleanup, retaining the existing core API, bounded lifetime and strict
readback checks. This fixes a proven race without claiming it was the sole cause
of that observed failure. Re-run real-core and full hosted acceptance for release.

Reviewed Genesis Plus GX and PicoDrive snapshots now expose canonical guest RAM
to pure game editors. Runtime identities are pinned separately from administrator
game associations. Capture for editing pauses and publishes one base; writeback
checks the complete capture, publishes atomically, verifies the actual queued
load and preserves failures paused for retry of the same revision. Native SRAM,
opaque state blocks and unrelated bytes remain unchanged. Wrapper controls cannot
bypass the workspace pause. See [synchronization](../../platform/SYNCHRONIZATION.md#console-memory-editing).

The [Phantasy Star IV adapter](../../platform/src/editors/phantasy-star4/README.md)
supports the supplied Ken Tse Chinese 1.6 Original mode: money, experience,
current HP/TP, maximum HP/TP up to 999, skill-use limits up to 99, four base
attributes and selectable learned abilities, plus forty-slot inventory reordering.
Reviewed rules are read from the authorized immutable game asset with bounded size
and digest checks. Attack, defence and magic defence are read-only computed results;
only the four base attributes accept combat-stat edits. Controls show equipment
bonuses and update with draft bases; previews include equipment-adjusted effects.
The API rejects derived writes, and unrelated edits preserve stale or wrapped totals.
Equipment-adjusted totals are recalculated; capacity guards
reserve future level-up and fixed story/hardware slots. Equipment and level remain
read-only. Chinese character, item and ability labels match the supplied translation;
the English catalog retains its MIT attribution. Neither binary tables nor fonts
are distributed; the local reference editor supplied no reusable license.

The 2026-11-23 original-game acceptance used newly selected Gires and Medice,
confirmed resource consumption, and retained all twelve edited/consumed values after
an in-game save and fresh boot with only native SRAM. Derived combat totals also
matched. Level-ups and story events can replace one-time edits. Tests cover linked
draft limits, cleared selections, future capacity, canonical replay and byte
preservation; this evidence does not establish every ability/event combination.

The [Japanese Mega-CD SAN3 adapter](../../platform/src/editors/san3/README.md)
remains a paused program-RAM editor. Both supplied GameCheatKits branches were
reviewed against 95 callback fields and 215 displayed columns, including diagnostics.
The [coverage mapping](../../platform/src/editors/san3/PARITY.md) records coherent
gameplay replacements and deliberate exclusions; it is not a raw debugger clone.
Unknown bytes, arbitrary list links and battlefield coordinates remain excluded.

Historical base abilities are now read-only in both UI and API, including mixed
and batch drafts. Original-game Save/Load retained an unsaved second ability set
within the same runtime, but a fresh SRAM-only boot restored all six disc defaults.
That retention was residual RAM, not native persistence. Creation and battle
operations remain available with explicit temporary-state guidance. Existing
edited checkpoints are preserved. Native campaign Save includes custom records,
but a fresh title Load uses separate global registration data. A second Load from
the strategic system menu restores the campaign's edited definitions, including
a newly introduced ruler's name and portrait. The editor does not synchronize
that global registration file or claim native battle-save persistence.

The current candidate adds direct service/placement for complete unused custom
definitions, and future automatic appearance for registered ordinary slots with
the scenario option enabled. The native annual event and subsequent saved roster
were verified; scheduling keeps the native registered-prefix rule. Custom names,
abilities and placement share one draft. Maximum creation defaults set six 100s
and use reviewed allocation operands to reach confirmation without spare points.
A younger male registration retained the complete record after registration Save
and a fresh SRAM-only boot. Younger male/female ordinary templates have native
allocation evidence; older rows have static/generated-test coverage only.

Leadership changes include governors and cross-city succession with current-ruler
cache repair. Same-faction relocation preserves armies, equipment and leadership;
departing task participants are cancelled. Allegiance changes refund equipment
and release armies, with named effects. Single/batch ordinary, governor and ruler
moves survived original Save and fresh SRAM-only Load. City transfer, abandonment,
absorption, life/discovery and covert workflows preserve coherent lists/contracts.
Four administration modes expose native delegation; military, production and
adaptive modes have cold-load evidence, direct management has static/unit evidence.

Personal treasure flags can duplicate items without changing global owners. Books
cap at seven per officer independently of the native issuance counter. Factions
expose bilateral alliances, directed hostility, control, symbols and remaining-turn
order. New factions can settle a neutral city or split off a noncapital city.
Original-game tests created both kinds, preserved 101 changed values after native
Save/cold Load and reached both new player turns in the next month's native queue.
The original faction retained its other cities. This does not prove every secession.

Tasks preserve shared clocks/results, allow idle officers to join groups of up to
ten, and preview action-flag effects. Construction uses actual port ship queues,
not the legacy task-9 label. Battle equipment exchanges reconcile stocks; reserve
eligibility preserves losses and uses native Deploy/Retreat for map placement.

Original-game checks exercised younger creation rows, army/equipment changes,
leadership/territory/life/discovery operations, task-group monthly settlement,
covert recruitment/return, ship completion/cancellation and land/naval commands.
The tested campaign operations survived native saving and cold loading, subject
to the custom-definition second-Load behavior above. Checkpoint writeback preserved
all 73,728 native companion bytes. These are verified cases for this edition,
not universal campaign/emulator compatibility.

Selected city controls share an immutable, document-scoped list context; even
72 valid governor candidates require one graph traversal. Actual edits still
validate the resulting document. Original mutable relocation graphs remain
independent, and malformed-list failures cannot contaminate other documents.
Scalar/book/personal-treasure batches skip relocation destination construction;
explicit move batches still validate every destination and the complete final draft.

Editor writes require a fresh paused capture after every resume. Failed published
writeback retains the pause and original retry target. Clean captures can switch
between campaign, registration and battle schemas; dirty drafts remain protected
against cloud changes. Synthetic runtime tests exercise actual PicoDrive snapshot
load/readback rather than replacing the emulator with a mock.
Focused sandboxed browser checks cover custom service/scheduling, personal-item
batches and relocation with canonical draft/language retention, actual paused
writeback and unchanged native companions. Proprietary samples and diagnostics
remain private. The candidate passes all 873 unit/database tests (98.97% line
and 95.07% branch coverage), lint, both type checks and the production build.
Complete browser and hosted checks for the exact release, automatic deployment
and production save-preservation acceptance remain required for promotion.

Hosted browser checks exposed SAN3 scenarios sharing a single account's real
request budget; a failed upload also collided with its retry's immutable release.
Each scenario and retry now owns a fixture account and distinct release. Production
limits and isolation assertions remain unchanged. These synthetic accounts exist
only in the disposable browser-test database. Creation-default editing has its own
real-runtime flow so it does not consume the strategic workflow's request/time
budget. Both tests retain schema transitions, bilingual drafts, actual PicoDrive
writeback and unchanged native-save assertions.

The game canvas now owns scrolling keys while focused, including repeated arrows
and Space. Explicit Start/Resume hands it focus; controls selected during loading
and background resumes retain their existing focus. Real MD and DOS browser cases
verify game input, stable page position and ordinary editor/language keyboard use.
Failed stops retain the input handlers until a successful stop.

Earlier original-game acceptance verified base strength/agility/mental
235/227/220 and totals 245/230/220. Removing and restoring the weapon changed
attack 245/240/245; the helmet changed defence 230/229/230, without changing bases.
All six values survived native saving and a fresh SRAM-only boot. Synthetic
browser checks cover base edits, read-only derived totals, translated
drafts, effect previews, actual snapshot writeback and unchanged native SRAM.
The read-only combat UI passed all 554 unit/integration tests, lint, types and
build, plus its sandbox-enabled browser flow. Published CI remains the acceptance
record for the complete browser suite and container checks.

The earlier SAN3 parity baseline passed all 790 unit/database tests (99% line and
94.86% branch coverage), lint, both type checks and production build. The local
full test run bounded workers to four; no test or timeout was relaxed. Focused
sandboxed browser checks cover actual runtime writeback, unchanged native SRAM,
canonical drafts, repeated previews and language/record/module switches.
All 26 repository policy tests, 33 deployer tests and the 340-package dependency
license review passed. Complete browser/container checks and production save
preservation remain mandatory for the exact promoted revision; hosted CI is the
release record. No proprietary fixtures, private captures or dependencies were added.

## Shared Mega CD BIOS

Administrators maintain one 128 KiB BIOS per J/U/E region. Content headers identify
the region; new discs select firmware from their boot region without repeated
uploads. Startup adopts missing regions from existing packages. Shared replacements
are atomic and reject stale administrator tokens; they never change published
games, profile bindings or snapshots. An explicit configuration choice can publish
a derived release with the current shared BIOS. No vendor firmware is distributed.
The registry is bounded to 384 KiB and does not retain replacement history.
Firmware-only requests do not read or hash game assets. See [library management](../../platform/LIBRARY.md).

MD5 recognition covers the documented J/U/E dumps, both common US revisions and
the additional Japanese dump used by the operator. New unknown uploads require an
explicit administrator acknowledgment; malformed files and mismatched regions
remain rejected. Existing packages keep their identities. Private copies of all
three operator BIOS files matched the registry; one-byte mutations were rejected
without modifying originals. Public tests use original synthetic firmware and the
same explicit acknowledgment, never vendor firmware or a test-only bypass.

Local lint, types, build and 396 unit/database tests pass. Focused browser checks
cover regional reuse across distinct discs, rejected files, configuration updates,
private progress and real emulator save/restore. Private J/U/E firmware headers
were recognized read-only; this is not an all-firmware compatibility claim.
An initial combined browser run exposed a shared test account's real 429 limit;
independent console-management flows now use separate fixture accounts and assert
download status, without changing production limits. Complete browser and hosted
container checks remain mandatory for the exact candidate before promotion.

## DOS audio and automatic synchronization

The 2026-11-23 follow-up reproduced an underrun during a brief PCM delivery stall.
The reviewed local worklet variant increases its finite target from about 46 ms
to 100 ms, adding about 54 ms of audio latency. Resampling, playback pacing and
save synchronization are unchanged. Both the bundle and its preferred mapped
source carry the adjustment; the build rejects unexpected input. DOS identity
records the variant without invalidating native-file progress or console snapshots.
Real-WASM regressions at 44.1/48 kHz inject a FIFO-preserving 60 ms delivery delay
and retain the existing rate, overflow, underrun and configuration assertions.
Long OS suspensions or sustained CPU starvation remain outside this buffer's scope.

The DOSBox adapter keeps configuration defaults beside archive restoration. Its
native mixer prebuffer defaults to zero, retaining explicit game overrides and the
browser's audio buffer. The effective config is installed last. Real WASM tests at
44.1/48 kHz output check pacing, overflow, underruns and config precedence.
A private Koukai2 opening through the production adapter also delivered about
44,098 samples/second over a 31-second measured interval, with no dropped samples
or underruns. This is bounded runtime evidence, not an all-game/device guarantee.

Automatic checks observe declared files while running and skip unchanged groups.
Changed groups are freshly captured while paused; only that owned collection is
published. Play resumes before background uploads/retries, with later game writes
retained for the next capture. Errors and changed cloud heads pause and preserve
the current instance. Manual exits, user pause state, immutable retries, revision
guards and explicit conflict recovery remain enforced. See [synchronization](../../platform/SYNCHRONIZATION.md).

Local lint, types, build and all 385 database/unit tests pass. The focused real-DOS
checks cover unchanged observations, transient observation bytes, multi-file
captures, admission retries during continued play, filesystem failures, quota
errors, lost responses, concurrent imports, conflict recovery and live edits.
Complete browser and hosted/container checks remain mandatory for the exact
candidate before promotion. Private acceptance records compare every pre-existing
revision and file hash; deployment must not replace the existing data volumes.

## Deployment evidence

The browser CI job uses Ubuntu's official HTTPS archive after repeated hosted
runner mirror stalls in package indexes and font downloads. Package signature
checks, browser isolation and all tests remain enabled; dependency installation
has an eight-minute timeout and a failure still blocks promotion.

Images pin Node 24.22.3 and PostgreSQL 18.7. Compose uses `rebito` and isolated
`rebito-tests` resources. Earlier deployments need the [migration](../../platform/DEPLOYMENT.md#project-names-and-earlier-deployments).
Historical review evidence below is separate from the new cloud installation.

The five-user experiment shared two CPUs and 1.5 GiB between app/database, reserving
512 MiB for the host. All 120 API saves succeeded first try; five real Mega CD
players recovered injected busy responses. Ordinary-save p95 was 0.28 s; 64 MiB saves
with large downloads reached 5.38 s. Peak memory was 1,116.5 MiB including initial
cache, without OOM. Restart verified 130 revisions. See [capacity acceptance](CAPACITY_SAVE_QUEUE.md);
these private development measurements are not relabeled as results for this replay.

A fresh review image passed administrator authority, notices and exact save recovery
after recreation without bootstrap secrets. Disposable containers/volumes were
removed. Verified caches were used; cloud HTTPS/network/disk and an uncached online
build remain separate checks.

A fresh AlmaLinux 9.5 installation completed an online image build, HTTPS access,
administrator login after removing bootstrap credentials, and a certificate renewal
dry run. The optional [single-host deployer](../../platform/deploy/README.md) polls
protected main over outbound HTTPS; no webhook or GitHub token is installed.
Its policy/transaction/host tests pass on Windows and Linux. An isolated real
PostgreSQL/file-volume drill restored startup mutations, then passed a successful
cutover and restart. Nginx maintenance returned 503 before reopening healthy traffic.
The deployer checks exact CI evidence and retains current/previous/failed artifacts;
host secrets, rollback copies and deployment receipts remain outside Git. Promotion
still requires successful hosted checks for the exact candidate revision.

The maintainer approved a thirty-day, build-only exception on 2026-11-18 for
[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) in
Picomatch 4.0.7, superseding the earlier decision to wait. No published fix was
verified that day. The exact lockfile, advisory and expiry are enforced by the
[dependency policy](DEPENDENCIES.md#temporary-build-dependency-exception).
Full audit output remains visible; every other high/critical finding still blocks.
The browser inventory and installed runtime checks reject the affected package;
the actual runtime audit has no exceptions. Candidate `1031d62` passed both hosted
Node application checks, all 48 browser flows, container persistence/rollback,
secret scanning and the complete commit policy; both CodeQL analyses also passed
on main. Local checks include the full database suite, build and 48 browser flows
with Chromium's sandbox enabled. The host checks the approval window before
building and again before cutover; its 33 tests pass on Windows and Linux,
including expiry during a build without stopping production.

The cloud acceptance baseline contains one existing profile, four revisions and
six files; eight authenticated artifact downloads match their recorded hashes.
Each actual promotion must repeat this read-only comparison, check both rollback
archive hashes, confirm the deployed revision matches protected main, and verify
health and unchanged branch protection. Private deployment receipts retain these
results; neither user data nor host credentials belong in this repository.
The exception expires at 2026-12-18 03:13:54 UTC. Next: replace the affected
dependency when a verified fix is available, review its license/lock changes,
remove the exception and repeat the full release checks. Do not renew it silently.
The initial automatic attempt was safely rejected before cutover because Docker
CLI tried to write beneath the protected home directory. The service now directs
that state to `/var/lib/rebito/docker-cli`; home protection remains enabled.
With this service configuration, the timer automatically deployed `1031d62` on
2026-11-18. Post-cutover acceptance preserved all four existing revision records,
all six baseline file hashes and all eight authenticated downloads. Both rollback
archives passed checksum verification; HTTPS, administrator access and both
containers were healthy, bootstrap credentials were absent, and branch protection
was unchanged. The installed runtime audit found zero vulnerabilities without
exceptions. Subsequent revisions still require their own checks and acceptance.

## Source licensing and GitHub

Original source/docs/test programs use AGPL-3.0-or-later from the first platform
commit. Canonical `LICENSE` and separate `NOTICE` agree across source, Docker and
browser notices. GitHub's AGPL-3.0 display does not narrow the explicit or-later grant.

Public main has passing platform/CodeQL checks. Private reporting, dependency and
malware alerts, secret scanning and push protection are enabled, with zero open
alerts at the earlier publication review. Three verified private-route rate-limit false positives remain closed with
real database regression tests. Main requires all five application/policy/container
checks, current branches and linear history; force pushes/deletion are blocked with
no bypass actors. Cloud promotion uses a normal fast-forward after required checks;
it does not weaken or bypass protection. The temporary audit approval does not
dismiss GitHub alerts or change these settings.

Source is the only publication scope. Some cores prohibit commercial use, and
noncommercial intent does not resolve combined GPL/noncommercial WASM conflicts.
Corresponding-source/build provenance and combination permission remain blockers to
binary/container distribution and public runtime hosting. Read [licensing](LICENSING.md),
[runtime evidence](RUNTIME_SOURCE_REVIEW.md) and [dependencies](DEPENDENCIES.md).
Operators must provide required source access for modified network versions; game
and BIOS rights remain separate.

Start with [development](../../platform/README.md), [deployment](../../platform/DEPLOYMENT.md),
[game management](../../platform/LIBRARY.md) and [operations](../../platform/OPERATIONS.md).
