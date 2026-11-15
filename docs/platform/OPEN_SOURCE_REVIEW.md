# Public source readiness review

Review date: 2026-11-15. Scope: the tracked web platform, repository automation,
original test generators and documentation. Proprietary games, BIOS, saves,
legacy executables, local desktop experiments and private diagnostics are excluded.

The reviewed source is prepared for publication under AGPL-3.0-or-later for original
work. This is not clearance to redistribute the complete runtime/container bundle.
See [licensing boundaries](LICENSING.md) for noncommercial cores and outstanding
native corresponding-source/build inventories. An archive hash or a successful
emulation test does not settle those distribution obligations.

The publication scope is source only; no prebuilt bundles or images are released.
The selected cores retain their noncommercial restrictions. Original code uses
AGPL-3.0-or-later; this does not resolve conflicts within combined emulator builds.

## Final code and repository changes

- Kept the existing service/runtime/editor boundaries and established libraries.
  No extra service, queue broker, ORM or C++ bridge was introduced.
- Corrected a shared error-message bug: administrator uploads no longer claim
  that automatic save retries were exhausted. Save retry exhaustion has its own
  error identifier; tests distinguish the two cases.
- Added the project AGPL grant and retained it in the container and emitted browser
  notices. A policy test prevents the two build-context license copies from drifting.
- Added pinned Gitleaks history scanning, with an exact identifier/path exception
  for the adapter fixture and its scanner self-test. Both files are tested with a
  generated secret-like value to prove that other findings remain detectable.
- Expanded artifact exclusions to game/disc packages, firmware, emulator bundles,
  databases, private keys and downloaded/build outputs. Empty commits are rejected.
- Replaced template-facing documentation, removed the empty template changelog,
  condensed stale status notes and documented private vulnerability reporting.

## Publication history

The public history was curated from private development after reviewing the final
code. The original history and uncommitted desktop work are retained locally;
neither is part of the branch intended for publication.

The initial 24 template/setup steps became one meaningful foundation commit.
Recommended lint, erasable server TypeScript, explicit browser sandboxing and
historical formatting fixes were moved to their relevant introduction points.
The browser launch assertion and save-retry message correction were folded into
their owning changes. Meaningful feature evolution, fixes and acceptance records
remain independently reviewable; author attribution is retained.

Including this report, the branch contains 109 nonempty, single-line Conventional
Commits. Every handwritten diff is within 500 added plus deleted lines; the largest
is 497. Four generated dependency-lock updates exceed the total budget and have
their reasons recorded in the same commits' [engineering log](ENGINEERING_LOG.md).
Locks were never omitted or split away from the dependencies that require them.

Older acceptance reports retain explicitly marked **private development** commit
labels. They identify the originally measured snapshots, not resolvable commits
in the curated public history. Their measurements have not been relabeled as
tests of newly created commit IDs. CI now checks the complete ancestry, including
the root, without relying on the old pre-platform commit number.

## Verification performed

| Check | Result |
| --- | --- |
| Historical application states | All 96 distinct `platform` trees passed lint, type checks, their full unit/integration suites and production builds |
| History coverage | Every published commit's application tree matched a verified tree; the three initial documentation/policy commits have no application yet |
| Current Windows / Node 26 and Linux / Node 24 | 311 tests each, lint, types and builds passed |
| Current browser suite | All 44 tests passed in Chrome with Chromium sandboxing explicitly enabled |
| Container acceptance | Image notices/dependency checks, fresh-volume startup, accounts, save upload/download and app/database restart with exact saved bytes passed |
| Repository policies | 15 tests passed, including root commits, empty commits, artifact rejection and license consistency |
| Dependency licenses | Current 280 lock records and all 10 historical lock snapshots / 2,327 records passed the metadata policy |
| Production dependency audit | `npm audit --omit=dev --audit-level=high` reported zero known vulnerabilities at review time |
| Public Git contents | Complete reachable-history policy, secret and blob inspection found no binary artifacts, embedded workstation paths or unaddressed secret findings |

Historical checks ran in disposable checkouts with real PostgreSQL. Results were
bound to complete application-tree IDs, including tests/configuration/locks; only
byte-identical trees reused a prior result. Coverage thresholds were retained.
Windows line/branch coverage was 98.12% / 92.51%; Linux was 98.60% / 92.51%.
Historical browser/container deployments were not rerun at every commit; those
runtime checks apply to the reviewed final application. Temporary verification
worktrees, containers and volumes were cleaned up after acceptance.

## Publication handoff

The prepared local branch is `codex/open-source`. No push or hosted GitHub CI run
has occurred. The configured template remote is not the publication destination.
Select the actual repository, enable private vulnerability reporting and push only
the reviewed branch. Do not mirror private backup refs. Require the platform CI
checks before merging contributions; local acceptance does not replace that first
hosted run or target-cloud TLS/network/disk verification.

Publish reviewed source only until the runtime distribution inventory is complete.
AGPL permits commercial use of original code, but does not remove third-party
copyleft, source-delivery or noncommercial terms. Keep game/BIOS upload rights and
runtime distribution rights separate from the application's own license.
