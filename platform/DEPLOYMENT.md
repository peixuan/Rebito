# Container deployment

Requires Docker Engine with Compose v2. Runtime images are pinned by digest from
the public Amazon ECR mirror of Docker Official Images; application dependencies
are pinned by `package-lock.json`. No game data is embedded in the image.

For a small Linux server, the optional [single-host deployer](deploy/README.md)
polls protected main after CI, takes consistent rollback copies and deploys without
an incoming webhook or a GitHub credential on the server.

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

## Project names and earlier deployments

The default Compose project is `rebito`: containers are `rebito-app-1` and
`rebito-database-1`, the network is `rebito_default`, and persistent volumes are
`rebito_saves` and `rebito_database`. The test stack uses `rebito-tests`.
The `-1` suffix is Compose's instance number. Keep generated names: a fixed
[`container_name`](https://docs.docker.com/reference/compose-file/services/#container_name)
prevents that service from scaling beyond one container.
An explicit `-p` or `COMPOSE_PROJECT_NAME` overrides the default; update deployment
automation deliberately and use a distinct project name for each separate instance.

The earlier default was `retro-portal`. A name change does not move its data:
starting `rebito` directly would create empty volumes. For an existing deployment,
stop its app, make a consistent database/save backup, and follow the
[restore drill](OPERATIONS.md#restore-drill) into the new project.
Preserve its `.env` secrets, administrator IDs and origin during migration. Confirm
login, game assets and exact save bytes before switching traffic. Keep the old
volumes stopped for rollback; never use `down --volumes` or volume pruning to rename
a deployment. On failure, stop the new app and restart the old project with its
original configuration. No automatic migration or deletion runs during startup.

## Creating accounts

For first deployment, set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` in
the private `.env` or the container environment before starting the app. Login
uses that email address. `INITIAL_ADMIN_NAME` optionally sets the display name
(default `Administrator`). The password must contain 12-128 characters; there
is no built-in password. Compose passes all three settings to the application.

Initialization creates a stable administrator identity, serializes concurrent
startups and can resume an interrupted creation. It never promotes an existing
ordinary account with the same email. After success, remove the initial credentials
from the deployment environment; the account and its authority persist in the
database. Reintroducing or changing these settings does not reset credentials or
create another administrator. Registration remains closed unless enabled separately.

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
Administration grants shared-library management and confirmed deletion of all users'
progress for a selected release. It does not grant reading other users' save contents.

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

## Runtime image updates

Reviewed baseline: Node 24.22.3 and PostgreSQL 18.7, pinned by tag and digest.
The Dependabot configuration proposes weekly Docker/Docker Compose updates once
this repository is hosted with Dependabot enabled; it does not deploy or merge
them. Major-version updates remain a separate migration decision. Keep the database
pin aligned in `compose.yaml`, `compose.test.yaml` and the platform CI service.

For each update, review upstream security notes, run the platform and real-browser
checks, build the image and run the container acceptance job. Preserve a rollback
image and make a consistent backup, then prove restoration into separate volumes
before changing the deployment. PostgreSQL minor updates can have additional index
repair requirements: review those against the actual database instead of assuming
that replacing the image completes every upgrade. Recheck revision metadata and
game/save hashes after the change.

Build-cache retention is configured separately on the Docker host; see
[operations](OPERATIONS.md#build-cache-retention). It does not limit game volumes.
