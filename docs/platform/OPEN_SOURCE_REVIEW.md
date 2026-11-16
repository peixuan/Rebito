# Public source readiness review

Initial review: 2026-11-15; ancestry correction: 2026-11-16. Scope: the tracked web platform, repository automation,
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

The publication branch descends from the exact retained template baseline
`a20553aaf4bd0c506c8ddf8066ab74af6f9fdc03`, including all of its ancestors.
The earlier new-root candidate was superseded; it is not the publication history.
Platform work starts with a focused scope/contribution change after that baseline.
Recommended lint, erasable server TypeScript, explicit browser sandboxing and
historical formatting fixes were moved to their relevant introduction points.
The browser launch assertion and save-retry message correction were folded into
their owning changes. Meaningful feature evolution, fixes and acceptance records
remain independently reviewable; author attribution is retained.

The restored development sequence contains 108 nonempty, single-line Conventional
Commits after the baseline, followed by the current policy/source-inventory work.
Before the AGPL replay, each historical application tree matched the verified candidate.
The adjacent license and secret-scanner preparation changes were combined into one
source-publication change: their genuine author times were only one second apart.
Other original author dates were retained; committer dates record actual replay
times after per-commit checks, with no invented/backdated timestamp sequence.
The license test checks the canonical project grant and official legal-text hashes,
accepting LF or CRLF without changing the license wording.

Authored diffs retain the 500 added/deleted line limit. The owner-approved exception
is the initial complete 661-line AGPL body in each of the two build contexts;
authored grant prefixes still count. Four generated dependency-lock updates also
exceed the total budget and have
their reasons recorded in the same commits' [engineering log](ENGINEERING_LOG.md).
Locks were never omitted or split away from the dependencies that require them.

Older acceptance reports retain explicitly marked **private development** commit
labels. They identify the originally measured snapshots, not resolvable commits
in the curated public history. Their measurements have not been relabeled as
tests of newly created commit IDs. CI verifies baseline ancestry and checks
subsequent commits, including rename-aware size accounting and both timestamp
sequences. Inherited template commits remain unchanged, not relabeled as platform
features. Secret scanning covers them too.

## Verification performed

| Check | Result |
| --- | --- |
| Historical application states | All 96 distinct `platform` trees passed lint, type checks, their full unit/integration suites and production builds |
| History coverage | Every published commit's application tree matched a verified tree; the three initial documentation/policy commits have no application yet |
| Current Windows / Node 26 and Linux / Node 24 | 311 tests each, lint, types and builds passed |
| Current browser suite | All 44 tests passed in Chrome with Chromium sandboxing explicitly enabled |
| Container acceptance | Image notices/dependency checks, fresh-volume startup, accounts, save upload/download and app/database restart with exact saved bytes passed |
| Repository policies | 21 tests passed, including required ancestry, rename/copy accounting, timestamps, empty commits, artifact rejection and license consistency |
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

## 2026-11-16 source-material follow-up

The owner clarified that contributing project source is the immediate objective,
without a commercial-use requirement. No core was replaced. Original code remains
AGPL-3.0-or-later, component grants remain distinct, and runtime/image redistribution
still requires the evidence listed in [the runtime review](RUNTIME_SOURCE_REVIEW.md).

Eleven source records now bind license/build excerpts to immutable revisions and
the runtime archive set. All 24 console variants match their embedded core/frontend
revision markers and exact core license bytes. Builds preserve 33 unique verified
text files (837,662 bytes), rather than committing downloaded upstream files.
This material is not a complete corresponding-source archive.

Current checks: 21 root policy tests, 320 Windows unit/integration tests, lint,
types/build, nine material failure/HTTP tests within that suite and 12 real runtime/
sandbox browser tests pass. The Node 24 image builds from a verified cache and
serves every material with its expected bytes/type under the existing web policy.
The first network-only image build failed on GitHub's anonymous API limit; the raw
domain was unreachable. Cache-backed success does not erase that failed attempt.
The earlier 44-case browser and full deployment results above remain dated evidence.

The full post-baseline history passes size, subject and author/committer chronology
checks. Gitleaks and reachable-blob inspection include the retained template;
no secret findings, binary blobs or workstation paths were found. The original
desktop work and production service/data were not modified.

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
