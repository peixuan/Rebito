# Platform work status

Updated: 2026-11-15 (Asia/Shanghai).

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

The candidate is reviewed in an isolated worktree; the original platform branch
and pre-existing uncommitted desktop files are preserved. No remote has been
pushed. Do not push to the template remote; select the intended repository first.
The `codex/open-source` publication branch has a curated, checked history. All 96
distinct historical application trees passed their complete checks. See the
[source readiness review](OPEN_SOURCE_REVIEW.md) for scope, results and remaining
binary-distribution requirements. The next external step is the selected GitHub
repository's first hosted CI run and private vulnerability-reporting setup.

## Checks and next work

- All 15 root policy tests, dependency-license metadata, secret scans and artifact rules.
- `cd platform && npm run check`: 311 unit/integration tests, lint, types and build;
  Windows line coverage 98.12%, Linux 98.60%; both have 92.51% branch coverage.
- `npm run test:e2e`: 44 browser cases, explicitly sandboxed Chromium; real DOS,
  console, OIDC, editor, management and save-conflict/retry flows.
- Linux image notice/dependency checks, login/upload/download, app/database restart
  and exact saved-byte recovery passed in isolated fresh volumes, then cleaned up.
- Hosted GitHub CI and target-cloud TLS/network/disk acceptance have not run.

Start from [development](../../platform/README.md), [deployment](../../platform/DEPLOYMENT.md),
[game management](../../platform/LIBRARY.md) and [operations](../../platform/OPERATIONS.md).
Windows games are planned, not implemented; DOSBox-X assets alone do not establish
Win32 support. History is quota-limited but never automatically pruned. Offline
persistent save queues and arbitrary third-party editor plugins are not implemented.
