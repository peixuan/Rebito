# Platform work status

Updated: 2026-11-16 (Asia/Shanghai).

## Current implementation

Rebito is a TypeScript/Vue/Fastify/PostgreSQL application. Games run in the
browser; the server owns authentication, private revision history, game management
and optional pure save editors. See [architecture](ARCHITECTURE.md).

- DOS, NES, SNES, GB, GBA, MD, Master System, Game Gear and Mega CD adapters have
  real browser tests with original generated programs. Six console cores cover
  native persistence and snapshots; this is not universal game compatibility.
- Koukai2 has eight editor modules, independent expected-byte tests and 13 legacy
  whole-file comparisons. Real-game editing/playback was checked privately; no
  proprietary samples or old editor executables are distribution fixtures.
- Administrator uploads, launch/save configuration, no-upload updates and confirmed
  deletion are implemented. Shared assets and affected user histories are guarded
  by storage leases, impact checks and durable retryable cleanup.
- Accounts have isolated profiles and immutable revision checks. Password sessions
  and OIDC/PKCE were tested with an independent provider; LDAP is an external
  identity-provider federation option, not a built-in LDAP password service.
- Save admission permits two active uploads and eight queued requests. Explicit
  busy responses get bounded automatic retries using the same bytes/base revision.
  Conflicts and uncertain responses preserve local progress without blind replay.
  See [synchronization invariants](../../platform/SYNCHRONIZATION.md).

## Verified deployment and capacity

The local Linux deployment uses pinned Node 24.22.3 and PostgreSQL 18.7 images.
A backup/restore drill preserved all 28 physical files and 25 existing revisions
before the save-queue update. Production data and the rollback image are retained.

The repeated five-user experiment shares two logical CPUs and 1.5 GiB between
app/database, reserving 512 MiB for the host. All 120 API saves succeeded on their
first attempt; five real Mega CD players also recovered injected busy responses
without manual retry. Ordinary-save p95 was 0.28 s; 64 MiB saves with concurrent
large downloads reached 5.38 s. Peak aggregate memory was 1,116.5 MiB including
initial copy cache, with no OOM. Restart verified 130 revisions. Disposable test
volumes were removed. See [current capacity acceptance](CAPACITY_SAVE_QUEUE.md);
[earlier measurements](CAPACITY.md) document the superseded rejection behavior.

## Public source review

Original code, documentation and original test programs use AGPL-3.0-or-later.
The project publishes source only, with no prebuilt runtime or container releases.
Third-party licenses remain separate, and some console cores prohibit commercial
use. Noncommercial intent does not resolve incompatible terms in combined WASM.
Public source review does not clear assembled binary/container redistribution:
exact native corresponding-source/build inventories remain required. Read
[licensing boundaries](LICENSING.md) and [dependency policy](DEPENDENCIES.md).
The [runtime source review](RUNTIME_SOURCE_REVIEW.md) now records 11 pinned source
records and verifies all 24 console variants' core/frontend markers and license
bytes. Combined GPL/noncommercial WASM permissions, complete nested sources and
actual native build provenance remain unresolved; no binary release is approved.
The owner's immediate objective is contributing project source. Retain the current
cores while keeping source publication separate from assembled runtime/image
redistribution; changing the project license cannot resolve incompatible terms.
Verified upstream license/build excerpts are now retained in browser builds and
images, with archive-bound hashes, bounded downloads and rechecked offline caches.

The candidate is reviewed in an isolated worktree; the original platform branch
and pre-existing uncommitted desktop files are preserved. No remote has been
pushed. Do not push to the template remote; select the intended repository first.
The `codex/open-source` publication branch retains the exact `a20553a` baseline
and its ancestors, followed by 108 restored development commits and subsequent
review work. The earlier new-root candidate is superseded. All 96
distinct historical application trees passed their complete checks. See the
[source readiness review](OPEN_SOURCE_REVIEW.md) for scope, results and remaining
binary-distribution requirements. The next external step is the selected GitHub
repository's first hosted CI run and private vulnerability-reporting setup.

## Checks and next work

- All 21 root policy tests, including baseline ancestry, rename/copy budgets and
  three-second author/committer chronology; dependency metadata and artifact rules.
- Current Windows/Node 26 lint, types, build and 320 unit/integration tests pass;
  nine material-collection tests cover corruption, network failures, path safety,
  stale receipts, bounded output and actual HTTP delivery. Coverage remains
  98.12% lines / 92.51% branches; thresholds were not lowered.
- The current 12-case runtime/security browser regression passes for DOS, NES,
  SNES, GB, GBA, MD, SMS, GG and Mega CD with Chromium sandboxing enabled.
- The Node 24 Docker build and in-image checks pass using the verified material
  cache; all packaged excerpts are served over HTTP as identical plain-text bytes.
  The first clean network attempt failed on GitHub API rate limiting after the
  raw-file domain was blocked. It is not recorded as a passed clean network build.
- Previous complete acceptance: 311 tests on Linux/Node 24 (98.60% lines), all 44
  browser flows, fresh-container login/save/restart persistence. The current
  material-only change did not rerun that complete deployment scenario.
- Hosted GitHub CI and target-cloud TLS/network/disk acceptance have not run.

The 2026-11-16 licensing decision is applied from the first platform commit after
the exact retained baseline. Root/Docker licenses and package metadata agree.
The approved size exception covers only the hash-verified initial 661-line legal
body in each build context; authored notices and all code still count. Read
[the decision](ENGINEERING_LOG.md) and the source review before further replay.
Before public hosting, provide a prominent corresponding-source offer for a
modified network version and resolve emulator distribution blockers. No public
source URL is configured until the publication destination is chosen.

Start from [development](../../platform/README.md), [deployment](../../platform/DEPLOYMENT.md),
[game management](../../platform/LIBRARY.md) and [operations](../../platform/OPERATIONS.md).
Windows games are planned, not implemented; DOSBox-X assets alone do not establish
Win32 support. History is quota-limited but never automatically pruned. Offline
persistent save queues and arbitrary third-party editor plugins are not implemented.
