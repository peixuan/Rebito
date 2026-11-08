# Container deployment

Requires Docker Engine with Compose v2. Runtime images are pinned by digest from
the public Amazon ECR mirror of Docker Official Images; application dependencies
are pinned by `package-lock.json`. No game data is embedded in the image.

## Source publication and public hosting

The project publishes source only, not prebuilt application images. These commands
build a local image and do not establish permission to redistribute its runtimes.
Review the third-party terms before serving emulator assets to other users, even
without fees: their browsers receive JavaScript/WASM copies. Noncommercial intent
does not resolve incompatible licenses in a combined emulator build.

Original project code uses [AGPL-3.0-or-later](../LICENSE). When operating a modified
network version, prominently offer users its corresponding source, including the
covered changes and required build/install material. Publish the exact deployed
revision and local patches, not just a link to an unrelated or moving branch.
Do not publish secrets, user data, games or BIOS as part of that source offer.
The deployment currently has no configured public source link; supply one visibly
in the application before making a modified version available to remote users.

## Local build

```sh
cd platform
npm run configure
docker compose up -d --build --wait
```

The configure command creates a private, ignored `.env` with independent random
authentication, application-database and database-administrator secrets. It refuses
to overwrite an existing file. Do not replace generated database secrets after
initializing the volume without rotating the matching PostgreSQL role password.

The application listens on `http://localhost:3000` on the host's loopback interface.
For remote access, put a TLS reverse proxy in front of it and set `APP_ORIGIN` to
the exact HTTPS origin. Keep the database port private. The application runs as
the non-root `node` user with a read-only root filesystem and no Linux capabilities.
Its PostgreSQL role owns only its application database and is not a superuser.

## Creating accounts

Public registration is off by default. Supply a JSON object containing `email`,
`name` and `password` through stdin to the operator-only command:

```sh
docker compose run --rm -T app node dist/server/create-account.js < private-account.json
```

Use a password of 12–128 characters. Keep this private input outside the repository
and remove it after use. The command prints an account ID, never the password or
session. It does not enable the public signup endpoint. PowerShell users can pipe
`Get-Content -Raw` from a private file into the same compose command.

To grant game-library administration, put that account ID in `.env` as
`ADMIN_USER_IDS=<account-id>` (comma-separated for multiple administrators), then run
`docker compose up -d --wait app`. Existing accounts can read their own ID from the
authenticated `/api/session` response. Refresh the page to show **游戏管理**.
This is a one-time role setup; later game uploads require no container commands.
Administration grants shared-library management, not access to other users' saves.

## Persistence and operations

Use [browser game management](LIBRARY.md#browser-administration) to add releases.
The operator import command remains available for prepared bundles and larger files;
it runs inside the same image and data volume with its input directory read-only.

- `database` stores account and revision metadata; `saves` stores immutable bytes.
- `docker compose restart` retains both volumes. Do not use `down --volumes` on a
  deployment containing data you want to keep.
- Back up both volumes consistently with the application stopped; for PostgreSQL,
  use `pg_dump` plus the private save directory. Verify a restore before upgrading.
  Follow [storage operations](OPERATIONS.md) for guarded integrity checks,
  abandoned-file collection and a restore drill into separate volumes.
- `/health/live` checks the process; `/health/ready` also checks database access.
- Request logs omit URL queries, headers and raw exception payloads. Identity logs
  use fixed event categories. Correlate request IDs, status codes and database
  error codes; do not enable raw OAuth/token logging in a shared deployment.
- Review [configuration](CONFIGURATION.md) for OIDC. Configure the provider callback
  as `<APP_ORIGIN>/api/auth/callback/oidc`. LDAP/AD stays behind the provider.

Consult [status](../docs/platform/STATUS.md) for local acceptance and remaining
release boundaries. The image contains pinned emulator runtimes, not a game
collection; import your own game releases before starting a player.
