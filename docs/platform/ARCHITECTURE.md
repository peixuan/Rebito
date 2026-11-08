# Platform architecture

Decision date: 2026-11-07. Scope: DOS, FC/NES, SFC/SNES, GB and GBA.

## Decision: reuse libraries, keep a small application

Build a modular TypeScript application with Fastify, a browser SPA and PostgreSQL.
Reuse EmulatorJS/js-dos for emulation and Better Auth for account/session/OIDC
flows. Do not implement an emulator, password protocol, OAuth flow or component
framework. Game-specific save editing is our domain code.

### RomM evaluation

Source inspected: `rommapp/romm` at
`a688676de74e0e42c51c0399e20783989fd702d7` (local checkout in `.analysis/upstream/romm`).
This was source inspection, not a running RomM deployment test.

- RomM already provides library management, users, OIDC, device synchronization
  and save histories. Rebuilding its entire catalog feature set is out of scope.
- `frontend/src/views/Player/JsDos.vue` in this revision already connects
  `fsChanges.pull/push` to its save synchronization service. Earlier versioned
  documentation describing local-only js-dos saves does not describe this checkout.
- `PlayerShell.vue` has Vue composition slots; `EmulatorJSPlayer.vue` exposes
  `flushPendingSave`. These are source-level component boundaries, not a verified
  externally installable editor API.
- `backend/endpoints/saves.py` manages individual save assets and device sync.
  Our editor needs to publish an immutable collection of changed files with a
  required base revision, using the same path as gameplay uploads.
- Using RomM for this requirement would involve maintaining a frontend/backend
  fork or a second persistence/authentication boundary. Neither is justified for
  the smaller library/player/editor scope currently requested.

Therefore, do not vendor or fork RomM. Keep its existing integration design as a
reference and use the underlying maintained components. Revisit reuse if catalog,
metadata-provider or external-device-library features become central requirements.
This decision is about product fit, not an assertion that RomM is unreliable.

## Module boundaries

| Module | Owns | Must not own |
| --- | --- | --- |
| Browser shell | Library, profile selection, player/editor layout | Authorization decisions |
| Runtime adapters | Lifecycle, inputs, supported persistence operations | User accounts or game field offsets |
| Game manifests | Release fingerprint, runtime/core, launch and save configuration | Executable user-supplied plugins |
| Editor modules | Detect, describe, preview, apply on byte collections | HTTP, UI, database or disk paths |
| Identity | Library-backed login/session/OIDC | A custom LDAP password implementation |
| Save service | Ownership, immutable revisions, conflict checks | Emulator memory interpretation |
| Storage | Private blobs and metadata publication | Game-format rules |

Editor modules are reviewed code shipped with the application. A schema describes
ordinary fields; explicit code handles linked changes and checksums. Only install
modules for supported release/format combinations. Unknown bytes survive edits.

## Persistence and concurrency

Keep native game saves, emulator snapshots and writable file collections distinct.
A revision identifies its game release, parent revision, artifact names/hashes and,
when necessary, runtime/core version. Do not treat the Koukai2 ten-slot file as a
universal platform model. Games without native saves may still support snapshots.

Game assets are immutable. Mutable progress belongs to a server-authorized user
and profile. Browser caches are namespaced by user, release and profile.

Publish a completed artifact collection and the profile head using a checked base
revision. A stale write returns a conflict; it never silently replaces the newer
head. Editing and gameplay synchronization use this same service. Snapshot restore
must not silently replace a newly edited native-save revision.

An optional runtime file capability supports live native-save editing. The player
coordinates pause, base-file verification, server publication and guarded replacement
of the one edited file. Failed writeback retains the published revision for retry and
blocks stale uploads. Game memory and filesystem state remain distinct; users reload
the save inside the game. See [runtime details](../../platform/RUNTIMES.md).

Blob storage has a local-directory implementation initially. The service publishes
metadata only after blobs are durable; failed publication can leave reclaimable
unreferenced blobs, never a visible revision referencing an incomplete upload.
PostgreSQL owns revision metadata, ownership and atomic head updates.

## Identity and deployment

Use Better Auth for local accounts and optional OIDC. Validate trusted origins and
cookie/session configuration explicitly; authentication is not an authorization
check for a particular save. Keep account/provider identifiers stable and distinct
from display names and email addresses.

LDAP/Active Directory integration is through an OIDC identity provider such as
Keycloak or Authentik. The application does not acquire LDAP bind privileges.
Account linking and administrator provisioning must be explicit, never inferred
from an unverified email address or client-provided role.

The deployment is a single application service plus PostgreSQL and private data
volumes, with an external identity provider optional. Container defaults must avoid
embedded credentials, root execution and public database exposure. Production
requires TLS at the reverse proxy. Browser runtime assets are pinned and served
with the headers required by the chosen core, rather than fetched from `latest`.

## Validation sequence

1. Build formatting, lint, types, unit tests and reproducible installs into CI.
2. Test real authentication, per-user ownership and simultaneous revision writes.
3. Exercise container startup, migrations, persistence after restart and restore.
4. Run Koukai2 DOS save/edit/reload; run a console native-save scenario and a
   no-native-save snapshot scenario. Mocks do not satisfy runtime acceptance.
5. Migrate Koukai2 editing module by module against independent expected bytes and
   the preserved legacy comparison corpus. Existing C++ is a reference, not a
   production dependency or an infallible oracle.

## References

- [RomM source](https://github.com/rommapp/romm/tree/a688676de74e0e42c51c0399e20783989fd702d7)
- [EmulatorJS cores](https://emulatorjs.org/docs4devs/cores/)
- [js-dos filesystem API](https://js-dos.com/working-with-fs.html)
- [Better Auth Fastify integration](https://www.better-auth.com/docs/integrations/fastify)
- [Better Auth OIDC support](https://www.better-auth.com/docs/plugins/generic-oauth)
- [Keycloak LDAP federation](https://www.keycloak.org/docs/latest/server_admin/index.html#_ldap)
