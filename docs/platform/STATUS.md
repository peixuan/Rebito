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
- Docker Desktop is installed; engine startup and deployment tests remain to verify.

## Milestones

| Milestone | Status | Acceptance |
| --- | --- | --- |
| Engineering rules and commit gates | Implemented | Hooks and CI enforce subjects, artifacts and line budgets |
| Upstream reuse decision | Recorded | See [architecture](ARCHITECTURE.md); reuse runtimes/auth libraries |
| TypeScript service skeleton | Verified locally | Format, lint, types, 9 route tests, coverage and build pass |
| Progress collection contract | Verified locally | Native saves, snapshots and filesystem collections; portable paths and bounds |
| Platform and identity | Pending | Container startup; real login; per-user ownership checks |
| Versioned persistence | Pending | Conflicting writes rejected; restart and restore verified |
| Browser runtime adapters | Pending | DOS and console runtime save/restore exercised |
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

1. Establish an independent WSL Docker Engine for deployment verification. Desktop
   currently fails on a stale IPC endpoint; its cleanup was blocked by tool policy.
2. Implement authentication and the shared revision publication path before UI adapters.
3. Implement durable blob storage and transactional revision publication using the
   validated progress collection contract, without Koukai2 layout assumptions.

## Available checks

`node --test scripts/commit-policy.test.mjs`: 6 tests passed locally.
Enable local hooks with `git config core.hooksPath .githooks`.
The `platform` workflow checks every new commit since the pre-platform baseline;
remote CI has not run because this work has not been pushed.

`cd platform && npm run check`: format/lint, TypeScript, 29 tests for HTTP and
progress validation, and compiled build passed. Both modules have 100% measured coverage;
this does not imply coverage of the pending product features. The tiny process
entrypoint is excluded from unit coverage and needs container startup verification.

## Existing evidence

The desktop implementation documents 13 whole-file comparisons with the original
editor in `docs/VALIDATION.md` (currently local, not committed). Those examples are
useful regression evidence, not complete game compatibility proof. Preserve the
independent expected-byte checks as well as comparisons with the C++ implementation.
