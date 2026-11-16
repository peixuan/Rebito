# Public source readiness review

Reviewed: 2026-11-17. Scope: public main at `b927ddc` and the owner's
baseline-preserving history correction. Hosted acceptance must match the exact
published commit; local evidence does not replace GitHub's checks.

The independent 159-commit review also checks intermediate license statements.
An MIT project-license sentence was corrected in the status document's original
introduction, removing the following commit's redundant license correction.

Original source uses AGPL-3.0-or-later. This source review does not clear emulator
binaries, container releases or public runtime hosting. Read [licensing](LICENSING.md)
and [runtime evidence](RUNTIME_SOURCE_REVIEW.md).

## History and code review

Baseline `a20553aaf4bd0c506c8ddf8066ab74af6f9fdc03` and its ancestors remain
unchanged. The 109 original platform steps retain their chronology; five later
publication repairs are folded into their owning changes. Internationalization
accompanies the original features, as requested by the owner.

The reviewed lineage has 142 post-baseline changes. Scope review separates legal
text from project/community guidance, input controls from record browsing,
container logging from disk admission, dependency proposals from security updates,
and source licensing from secret scanning. Necessary tests, catalogs and operational
instructions remain with their implementation. Repeated file edits alone are not
a reason to merge independent behaviors.

The follow-up also preserves the editor guide across adjacent modules, introduces
its format explanation with the basic editor, and retains locale precompilation
when DOS/runtime build configuration changes. Immediate type/comment corrections
are folded into their original changes. The final application files are unchanged
from public main; the root commit guard now rejects any unrelated file accompanying
an approved license-text exception.

Review covers individual diffs, module boundaries, malformed-input/failure tests,
imports, formatting, documentation and dependencies. Editors remain independent of
HTTP, identity, storage and UI libraries. Stable message descriptors separate
translation from services. English/Simplified Chinese catalogs accompany features;
switching languages preserves games, drafts and table state. Chinese application
text stays in locale resources; README instructions and source/comments are English.

## Verification

The original 136 snapshots retain their 108 verified application inputs. Four added
dependency preparations pass application checks; two npm bootstrap steps pass
installation. Lint, server/browser type checks, production builds
and full unit/integration tests with real PostgreSQL cover those inputs. Reuse
requires matching platform files, configuration, lockfiles and the README consumed
by catalog tests. Repository scripts are verified separately for the changed historical input
variants; their current suite contains 26 tests. No assertions or gates were weakened.

An initial storage-UI split failed formatting and was corrected before acceptance;
the failure remains recorded. Its corrected intermediate version passes seven real
account, storage, library and language browser flows. The earlier DOS configuration
passes three real DOS/i18n flows with locale precompilation restored. Chromium's
sandbox remains enabled. Source-language boundaries and relative document paths
and heading anchors are checked across all snapshots.

For the unchanged final application, Windows Node 26 and Linux Node 24.22.3 each
passed 376 tests, lint, types and production builds. Line coverage was 98.20% and
98.65%, with 92.69% branch coverage. All 48 browser flows passed together. Earlier
runs found a stale Mega CD control-ID assertion and a DOS writeback wait timeout;
the assertion was corrected, and the unchanged DOS flow passed three repeats and
the complete run. Neither assertions nor timeouts were relaxed.

Ten historical lockfiles passed license review. Shared installed dependencies match
historical versions/integrity records, except the earlier compiler: all 11 pre-UI
TypeScript 7.0.2 inputs also passed checks using that exact compiler. Imports declare
their external dependencies. This is not a fresh installation, browser acceptance
or deployment test at every historical version. The separated administrator-upload
feature also passed its two real browser flows before catalog browsing was added.

A fresh Node 24 image passed admin bootstrap/authority, anonymous access rejection,
notice delivery and byte-exact save recovery after recreation without bootstrap
credentials. Browser/compiler dependencies were absent from the server install.
Verified caches were used; this is not an uncached online build or cloud deployment.
Disposable review containers and data were removed without changing the user's app.

Reachable history and candidate source inspections found no prohibited binary,
temporary/private-path artifact or unresolved secret. Gitleaks also passed the
source export. Synthetic saves and original generated programs are test fixtures;
ROMs, vendor BIOS, private saves and investigation output stay outside Git.

Dependency review covers 340 locked records. Vue I18n and its Vite plugin add 60
without changing prior versions. Bundled notices are retained and there is no CSP
relaxation or eval exception. Distribution obligations remain separate below.

## Commit accounting and dates

Subjects are concise, single-line Conventional Commits. Identity is preserved.
Original author and committer dates are recovered from source history, not the
previous replay's timestamps. All 109 source anchors remain unchanged; 33 split
parts have owner-authorized ordering offsets of at most 36 seconds. These offsets
are not measurements of development duration. See the [timestamp ledger](REPLAY_TIMESTAMPS.tsv).
Both sequences still advance at least three seconds; author time never follows
committer time. No chronology waiver was added. Recovery refs remain private.

Count additions/deletions using 50% rename detection, unlimited rename search and
no copy detection. Ordinary commits count every changed line, including lockfiles.
Only the approved canonical legal texts and `platform/package-lock.json` may exceed
500 lines in single-file commits; companion files always prevent the exception. Each initial
661-line canonical AGPL copy is the only file in its commit; the hash-bound
exception does not cover other changes. Authored notices count. Dependency preparation
remains installable; its purpose is recorded in the [engineering log](ENGINEERING_LOG.md).

## GitHub and distribution

At review, public main `b927ddc` had passing platform and CodeQL checks. GitHub
recognized AGPL-3.0; `NOTICE` retains the or-later grant. Private reporting,
dependency/malware alerts, secret scanning and push protection were enabled, with
zero open security alerts. Three verified private-route rate-limit false positives
remain closed with real database tests; the CodeQL query remains enabled.

Main requires the Node 24/26 application, commit policy, secrets and container
checks, current branches and linear history. It blocks deletion/force pushes with
no bypass actors. Require exact candidate checks before replacement, then restore
and verify protection after any owner-approved scoped exception. [GitHub Actions](https://github.com/peixuan/Rebito/actions)
is the live exact-commit acceptance record.

There are no binary releases. Eleven runtime source records and 33 retained review
materials are evidence, not complete corresponding source. Combined GPL/noncommercial
WASM permission, nested source completeness and native build provenance remain
unresolved. Resolve these blockers before runtime hosting or binary/container
distribution, and provide required source for modified network versions. Game/BIOS
rights and cloud TLS, network and disk acceptance remain operator responsibilities.
