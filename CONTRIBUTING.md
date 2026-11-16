# Contributing

Start with [AGENTS.md](AGENTS.md) and [the current milestone](docs/platform/STATUS.md).
Keep code, tests and documentation focused on the same behavior.

Original contributions are provided under the project's AGPL-3.0-or-later grant.
Contributors retain their copyright. Identify third-party code and its license;
do not claim the project grant replaces upstream notices or incompatible terms.

## Commit policy

Use one Conventional Commits subject line of at most 72 characters:

```text
feat(saves): reject stale revision updates
fix(auth): verify the login callback state
test(editor): preserve unrelated save bytes
```

Each commit must be atomic, buildable and independently reviewable. Count added
**and deleted** lines, including lockfile changes, against a 500-line budget.
Refactoring and behavior changes should be separate commits when each can stand alone. Do not minify code or split
an incomplete implementation merely to meet the budget.

The checker uses Git's 50% similarity rename detection with no rename limit.
Pure moves consume zero lines; edits inside moves count normally. Copies count
as additions. Do not override this by enabling copy detection locally.

Use your real, configured author and committer identities consistently. Each
author timestamp and each committer timestamp must advance at least three seconds
from the parent; the author timestamp cannot follow the committer timestamp.
Adjacent subjects must differ. Ordinary development uses actual timestamps.
The owner-authorized 2026-11-17 replay retains original source dates, with small
recorded ordering offsets for split changes; these are not original edit times.
See the [split timestamp ledger](docs/platform/REPLAY_TIMESTAMPS.tsv). Future work
retains the three-second rule and must not invent development dates. The checker
verifies ordering and identity syntax, not the historical truth of an identity.

Only `platform/package-lock.json` may exceed 500 lines in a dedicated single-file
commit. A mixed commit counts every lockfile line; an added, deleted, empty or moved
companion file prevents the exception. Keep each dependency preparation installable
with `npm ci`, and record its purpose in the adjacent implementation or policy docs.
No other lockfiles, generated assets or vendored dependencies receive exceptions.

The maintainer also approved one precise legal-text exception: the complete,
unmodified 661-line GNU AGPLv3 text in `LICENSE` and its identical `platform/LICENSE`
copy for the independent Docker build context. The policy checks its content hash
and allows only its initial introduction into an absent or empty file. The project
grant prefix still counts; changed text, extra copies and deletions are not exempt.
Each legal-text introduction must be the only file change in its commit.
See the dated decision in [the engineering log](docs/platform/ENGINEERING_LOG.md).

Stage named files and inspect `git diff --cached --check` and
`git diff --cached --stat` before committing. Do not amend unrelated prior commits.

Enable repository-local hooks once after cloning (Node.js 24 or newer):

```sh
git config core.hooksPath .githooks
node --test scripts/*.test.mjs
```

Hooks enforce the staged-file budget and subject. CI repeats history checks so
local hook installation is not the only enforcement point. Run
`node scripts/commit-policy.mjs --history` to check platform work after the baseline,
or `node scripts/commit-policy.mjs --range BASE_SHA..HEAD_SHA` for a specific range.
The publication branch must descend from
`a20553aaf4bd0c506c8ddf8066ab74af6f9fdc03`. This template commit and its ancestors
remain unchanged; modern commit rules apply to subsequent platform work. Secret
scanning still covers the entire reachable history, including the template.

## Quality gates

- Formatting, lint and type checks for production and test code.
- Unit tests for domain rules and malformed binary inputs.
- Integration tests for authentication, ownership, storage and revision conflicts.
- Browser tests for the user flows; real-emulator smoke checks before a release.
- Container build, startup health check and persistence across a restart.
- Dependency/license review and secret/artifact checks on tracked files.

CI scans reachable Git history with the pinned Gitleaks CLI. Locally, run
`gitleaks git . --log-opts=--all --redact=100` and
`node scripts/check-secret-scan.mjs` (set `GITLEAKS_BIN` if it is not on PATH).
The only configured false positive is one exact editor field in the adapter test
and scanner self-test. Do not exclude whole directories or conceal real findings.
ROMs, firmware, disc images, database copies and downloaded runtime archives are
not contribution artifacts. Use original fixture generators for reproducible tests.

Checks become mandatory as their components are introduced. A test stub or skipped
test is not evidence that a feature works. Do not lower coverage or disable checks
to accommodate a change; fix the cause or document a narrowly justified exception.

## Documentation and privacy

Write source, comments and contributor instructions in English. The README's
opening project introduction is bilingual; other README sections are English.
Place translated application text and verified game names in `client/locales/`,
using stable message IDs across API and editor boundaries. Language changes must
preserve input, selected records and running games. Run the catalog checks and
browser language flows when changing these boundaries; see
[internationalization](docs/platform/INTERNATIONALIZATION.md).

Keep public docs useful to a new contributor: setup, architecture, invariants,
commands, current state and next work. Avoid duplicated logs and copied upstream
documentation. Link to upstream documentation and record the pinned version used.

Use synthetic or redistributable test fixtures. Keep proprietary game data and
local diagnostics outside version control. Follow [SECURITY.md](SECURITY.md) for
private vulnerability reports; never put credentials or personal data in commits.
