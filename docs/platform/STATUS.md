# Platform work status

Updated: 2026-11-07 (Asia/Shanghai).

## Target

A container-deployable single-page gaming platform for DOS, FC/NES, SFC/SNES, GB
and GBA, with login, isolated versioned saves and optional server-side game editors.
The first editor reproduces the existing Koukai2 capabilities. Runtime and editor
support are separate: a playable game need not have an editor.

## Workspace facts

- Branch: `codex/retro-web-platform`.
- Remote still points to `peixuan/project-template`; do not push there.
- Existing C++/wxWidgets implementation and its documentation are pre-existing
  uncommitted local work. Preserve them as migration evidence, not new platform commits.
- Original game data: `<operator-game-directory>`; read-only for this project.
- Private development evidence and upstream checkouts belong in `.analysis/`.
- Docker Desktop fails locally; an independent WSL Ubuntu Docker Engine now runs
  PostgreSQL 18.6 integration and application containers. Windows Docker Desktop
  files were not changed to make this work.

## Milestones

| Milestone | Status | Acceptance |
| --- | --- | --- |
| Engineering rules and commit gates | Implemented | Hooks and CI enforce subjects, artifacts and line budgets |
| Upstream reuse decision | Recorded | See [architecture](ARCHITECTURE.md); reuse runtimes/auth libraries |
| TypeScript service skeleton | Verified locally | Format, lint, types, 9 route tests, coverage and build pass |
| Progress collection contract | Verified locally | Native saves, snapshots and filesystem collections; portable paths and bounds |
| Private blob storage | Verified on Windows/Linux | Exact bytes, concurrency, corruption detection; Linux publication and restart |
| Identity API | Verified locally | PostgreSQL migrations; password/session lifecycle; CSRF; closed registration |
| Container application | Verified locally | Non-root app; restricted database role; real login and save bytes survive full restart |
| Revision repository | Verified locally | Real PostgreSQL ownership, concurrent writers, rollback and immutable history |
| Save service | Verified locally | Durable blobs before publication; guarded download; non-destructive restore; storage failures |
| Save publication API | Verified locally | Real multipart imports, private downloads, stale writes, history and restore |
| Browser login shell | Verified in Chrome | Real registration/login/logout, session recovery and narrow-viewport checks |
| Game library and personal progress | Implemented | Verified assets; private catalog API; browser import, history, restore and account isolation |
| DOS browser runtime | Verified with own fixture | Real DOSBox WASM, native files, filesystem overlay, edited-byte precedence |
| Console browser runtime | NES verified with own fixture | Native SRAM import, real keyboard input and volatile snapshot restoration; SFC/GB/GBA pending |
| Koukai2 editor | Pending | Full module parity and whole-file regression comparisons |
| Release validation | Pending | Gates, end-to-end flows, deployment and handoff docs pass |

## Acceptance boundaries

- Distinguish native game saves, emulator states and writable file collections.
- Version snapshots against game release and emulator core where applicable.
- Back-end identity determines ownership; never trust a submitted user identifier.
- An edited save becomes a new revision. Stale game uploads cannot overwrite it.
- Use established emulator and authentication libraries. Prefer OIDC; demonstrate
  the documented LDAP federation route without requiring an LDAP server for everyone.
- Do not make supported-system claims from mocked adapters alone.

## Next work

1. Finish console runtime adapters and real-game acceptance above the verified DOS path.
2. Extend the typed Vue/PrimeVue shell with player/editor views and the backend
   Koukai2 editor; run real browser/game checks. Login is the first browser slice.
3. Exercise OIDC against a test provider; the configured provider boundary is not
   yet an end-to-end OIDC/LDAP verification.

## Available checks

`node --test scripts/commit-policy.test.mjs`: 6 tests passed locally.
Enable local hooks with `git config core.hooksPath .githooks`.
The `platform` workflow checks every new commit since the pre-platform baseline;
remote CI has not run because this work has not been pushed.

`cd platform && npm run check` with the test database: format/lint, TypeScript,
HTTP/domain/filesystem and real PostgreSQL identity/revision/service tests passed.
Measured Windows line coverage is above 97%. Linux-only
directory fsync is not exercised by the Windows run. This does not imply coverage
of pending product features. The process entrypoint and account-provisioning CLI
are excluded from unit coverage and exercised by the container smoke test.

Container verification used the pinned Node 24/PostgreSQL 18 images in WSL:
image build, healthy startup, stdin account creation, login/logout, multipart save
upload/download, full app/database restart, and exact saved-byte recovery passed.
The app UID is 1000; the database role has no superuser/create-role/create-db rights.
CI repeats build, startup and persistence smoke, but has not run remotely.

## Existing evidence

The desktop implementation documents 13 whole-file comparisons with the original
editor in `docs/VALIDATION.md` (currently local, not committed). Those examples are
useful regression evidence, not complete game compatibility proof. Preserve the
independent expected-byte checks as well as comparisons with the C++ implementation.
