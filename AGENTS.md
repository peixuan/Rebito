# Agent Instructions

Read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and
[platform status](docs/platform/STATUS.md) before changing code. Update the status
when completing a milestone or handing work to another agent.

## Product scope

Build a single-page retro gaming platform for DOS, FC/NES, SFC/SNES, GB and GBA.
Games run in browser emulators. The server owns authentication, private saves,
revision checks and optional game-specific save editing. Koukai2 is the first
editor adapter, not the platform's universal save format.

Prefer maintained open-source components. Evaluate RomM before rebuilding its
capabilities. Record decisions and evidence; do not assume an integration works
because an upstream documentation page lists a feature.

## Changes and commits

- One independently reviewable change per commit, with its relevant tests/docs.
- Commit messages are one concise Conventional Commits line, at most 72 characters.
- Keep each commit at or below 500 added plus deleted lines. Do not split a change
  into broken intermediate commits or compress code to evade the limit.
- Count all changed lines, including small lock updates, against the 500-line budget.
  Only `platform/package-lock.json` may exceed it in a dedicated single-file commit;
  keep dependency preparation installable and never omit the lockfile.
- The approved AGPL original-text exception is limited to the hash-verified initial
  license copies listed in CONTRIBUTING.md; authored notices still count.
  Introduce each complete legal text in a dedicated, single-file commit.
- Stage explicit paths. Do not use `git add .` or commit unrelated existing work.
- Never commit ROMs, BIOS, game saves, game executables, secrets, downloaded
  dependencies, build output, browser captures or reverse-engineering output.
- Use `codex/` branches. No push to the existing template remote without a separate
  instruction naming the destination.

## Implementation

- Separate platform services, emulator adapters, game manifests and editor modules.
- Keep save transformation independent of HTTP, UI, storage and authentication.
- Model game saves, emulator snapshots and writable file collections separately.
- Bind editor support to verified game/format versions; preserve unknown bytes.
- Authorize every private resource on the server and publish revisions atomically.
- Prefer OIDC integration; LDAP may be federated through an identity provider.
- Use small cohesive modules, descriptive names and comments explaining invariants.
- Keep user-facing text in `platform/client/locales`. Use stable message descriptors
  across server/editor/runtime boundaries; never use translated labels as identifiers.
  Preserve active games, draft values and table state when the language changes.
  English is the fallback; browser preference chooses English or Simplified Chinese.
  See [internationalization](docs/platform/INTERNATIONALIZATION.md).
- Add abstractions only for a demonstrated boundary, not speculative features.
- Use erasable TypeScript syntax so Node can run server sources directly. Keep
  browser build/type checks separate from the server's compiled output.
- Review dependency license changes; run `node scripts/dependency-policy.mjs`.
  See [dependency policy](docs/platform/DEPENDENCIES.md) before upgrading UI/runtimes.

## Verification

Run the checks for the changed component before committing. Cover malformed data,
ownership, concurrent updates and failures, not only the successful path. Emulation
and persistence require real runtime integration checks in addition to mocks.
Do not describe a mock, documentation review or generated config as a passed
deployment test. Record the exact checks and any remaining limitations.

Keep Chromium's sandbox enabled for both manual validation and browser tests.
Playwright launches must explicitly set `chromiumSandbox: true`; do not work around
startup or feature problems with `--no-sandbox` or other sandbox-disabling flags.

The existing desktop source is a local reference and has pre-existing uncommitted
changes. Preserve it; do not reset, move, delete or bulk-commit it during platform work.
