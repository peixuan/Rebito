# Platform work status

Updated: 2026-11-18 (Asia/Shanghai).

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

Windows games, persistent offline upload queues, automatic history pruning and
arbitrary third-party editors are not implemented. DOSBox-X remains a future
Windows 95/98/ME candidate, not evidence of general Win32 support.

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
Its 26 policy/transaction/host tests pass on Windows and Linux. An isolated real
PostgreSQL/file-volume drill restored startup mutations, then passed a successful
cutover and restart. Nginx maintenance returned 503 before reopening healthy traffic.
The deployer checks exact CI evidence and retains current/previous/failed artifacts;
host secrets, rollback copies and deployment receipts remain outside Git. Promotion
still requires successful hosted checks for the exact candidate revision.

## Source licensing and GitHub

Original source/docs/test programs use AGPL-3.0-or-later from the first platform
commit. Canonical `LICENSE` and separate `NOTICE` agree across source, Docker and
browser notices. GitHub's AGPL-3.0 display does not narrow the explicit or-later grant.

Public main has passing platform/CodeQL checks. Private reporting, dependency and
malware alerts, secret scanning and push protection are enabled, with zero open
alerts. Three verified private-route rate-limit false positives remain closed with
real database regression tests. Main requires all five application/policy/container
checks, current branches and linear history; force pushes/deletion are blocked with
no bypass actors. The authorized replay needs exact candidate checks before a scoped
publication exception, followed by protection restoration and verification.

Source is the only publication scope. Some cores prohibit commercial use, and
noncommercial intent does not resolve combined GPL/noncommercial WASM conflicts.
Corresponding-source/build provenance and combination permission remain blockers to
binary/container distribution and public runtime hosting. Read [licensing](LICENSING.md),
[runtime evidence](RUNTIME_SOURCE_REVIEW.md) and [dependencies](DEPENDENCIES.md).
Operators must provide required source access for modified network versions; game
and BIOS rights remain separate.

Start with [development](../../platform/README.md), [deployment](../../platform/DEPLOYMENT.md),
[game management](../../platform/LIBRARY.md) and [operations](../../platform/OPERATIONS.md).
