# Platform work status

Updated: 2026-11-23 (Asia/Shanghai).

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
edits strategic population, gold, food, soldiers, loyalty, training and morale.
Cities, officers and read-only faction totals share the compact bilingual editor.
Ownership changes, battle data and historical base-attribute editing are excluded.
Both games passed private original-game edit, in-game save and fresh native-save
boot checks. This is evidence for those editions and tested fields, not universal
ROM compatibility; proprietary samples and diagnostic output are not published.

Earlier original-game acceptance verified base strength/agility/mental
235/227/220 and totals 245/230/220. Removing and restoring the weapon changed
attack 245/240/245; the helmet changed defence 230/229/230, without changing bases.
All six values survived native saving and a fresh SRAM-only boot. Synthetic
browser checks cover base edits, read-only derived totals, translated
drafts, effect previews, actual snapshot writeback and unchanged native SRAM.
The read-only combat UI passed all 554 unit/integration tests, lint, types and
build, plus its sandbox-enabled browser flow. Published CI remains the acceptance
record for the complete browser suite and container checks.

All 532 database/unit tests pass (98.53% line and 94.49% branch coverage), along
with the 26 repository policy tests and dependency/license checks. Real MD/CD
runtime tests verify load acknowledgement, native-save preservation and pause
ownership. All 63 sandboxed browser flows pass, including console writeback
recovery and the existing DOS workflows. Hosted checks and production preservation
acceptance remain mandatory for each exact revision before promotion.

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
