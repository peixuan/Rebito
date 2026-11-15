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
`node scripts/commit-policy.mjs --range a20553aaf4bd0c506c8ddf8066ab74af6f9fdc03..$(git rev-parse HEAD)` to check platform work after the retained template baseline,
or `node scripts/commit-policy.mjs --range BASE_SHA..HEAD_SHA` for a specific range.

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
