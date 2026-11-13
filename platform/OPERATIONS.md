# Storage maintenance and recovery

## Capacity planning

The app and database use Docker's [local logging driver](https://docs.docker.com/engine/logging/drivers/local/)
with three 10 MB files each and compression of rotated files. Recreate both services
with `docker compose up -d --build --wait` to apply changed logging settings. This
bounds container stdout/stderr logs, not database files or external log collectors.

The default per-account limits are 100 profiles, 2,000 revisions and 2 GiB of logical
history. Identical blob contents share physical space; each retained revision still
counts its full logical size. DOS automatic sync publishes only when native files
change. Repeated manual captures and different snapshots can still grow history.
Quota exhaustion stops new saves; it is not automatic history rotation. Do not
increase quotas indefinitely as a substitute for a retention policy.

Before new blob writes the app leaves a configurable 1 GiB free-space margin. A
failed upload preserves the published head; the player remains paused for retry.
The guard covers this app process's pending writes, not all filesystem writers or
the Windows host space behind WSL's virtual disk. Monitor the data and database
filesystems, host disk, backup destination and Docker disk use separately.

Useful read-only checks are `docker system df`, `df -h`, and
`docker compose exec app du -sh /data`. Backups, old images and build caches need
their own size/retention budgets. Never use a blanket volume prune to manage saves.
Offline `collect` below only removes abandoned blobs; retained history needs an
explicit future retention/deletion policy, with current heads protected. No automatic
history deletion is enabled. No additional queue, cache service or metrics database
is needed for these bounds.

### Build-cache retention

For a local Docker Engine using the default `docker` build driver, merge
[`deploy/docker-daemon-gc.json`](deploy/docker-daemon-gc.json) into the existing
`/etc/docker/daemon.json`, preserving other daemon settings. Validate with
`dockerd --validate --config-file=/etc/docker/daemon.json`, then restart Docker
during a maintenance window. This is a host-wide builder setting, not an app
setting; coordinate it with other projects if the engine is shared. Docker Desktop
users merge the same `builder` settings through its Docker Engine configuration.

BuildKit's built-in garbage collector targets 2 GiB (`2GB` in its configuration). Its
default rules age out unused entries and then reclaim cache exceeding the target;
this is not a hard filesystem quota and active builds can temporarily exceed it.
No extra scheduled service is needed. Check the effective policy with
`docker buildx inspect --bootstrap` and usage with `docker buildx du`.

After completed builds, an initial cleanup can use
`docker buildx prune --all --force --reserved-space 2GB --max-used-space 2GB`.
This removes unused build cache only; it does not delete application images,
containers or data volumes.
Keep a known-good image and a consistent private backup across upgrades. Never
substitute `docker system prune --volumes` for this command. Backups, unused image
tags and the host virtual-disk file are separate from BuildKit's cache target.
Shared layers retained by images may still appear in the reported total; inspect
the `Shared` and `Private` figures in `docker buildx du` instead of adding image
and cache totals together.

References: [Docker build garbage collection](https://docs.docker.com/build/cache/garbage-collection/)
and [buildx prune](https://docs.docker.com/reference/cli/docker/buildx/prune/).

Use the same application image/configuration as the deployment. All commands below
run from `platform/` in a POSIX shell. Binary output redirection must preserve bytes;
on Windows, run these commands in WSL rather than an older PowerShell pipeline.

## Integrity verification and abandoned files

Game deletion uses a separate online reader/writer lease across application
instances. It waits for complete API handlers and asset streams before removing
history or files. All private handlers and the operator import CLI participate.
The online gate uses one additional dedicated connection per app process, sharing
reader locks across concurrent handlers. Upgrade all replicas together before using
online deletion; old versions do not participate in this protocol.
Deleting history and recording its cleanup job is one database transaction;
catalog removal precedes unlinking assets. Shared blobs/assets are checked again
on every retry. Interrupted cleanup remains visible to administrators, blocks new
library mutations, hides the game from players and is retried on startup.
An interrupted catalog publisher can leave `.import.lock`; do not remove that lock
while any publisher is active. Inspect it as described in [game imports](LIBRARY.md)
before retrying cleanup. No age-based lock takeover is permitted.

Unlinked files release space inside the data filesystem. PostgreSQL can reuse
deleted row space after normal vacuum; WSL/Docker virtual disks and backups do not
necessarily shrink on the host. Deletion does not prune backups or Docker images.

```sh
docker compose stop app
docker compose run --rm -T app node dist/storage/maintain-storage.js verify
docker compose run --rm -T app node dist/storage/maintain-storage.js collect
docker compose up -d --wait app
```

`verify` reads and checks every blob referenced by retained revisions. It reports
unreferenced content-addressed files and interrupted temporary writes without
removing them. `collect` performs the same verification first, then removes only
those abandoned files. It never deletes a revision or changes a profile head.
Corrupt/missing referenced data aborts collection; recover from a known good backup.
Unknown filenames are left alone. Stop all app replicas before either operation.

Game-management uploads use `library/.uploads/<uuid>.tmp` under the same application
storage lease. Completed and rejected requests remove their staging files; an
interrupted process can leave them behind. Offline `verify` reports these files
and `collect` removes them under the exclusive lease. Published library assets and
the catalog are never removed by this collector.

Mega CD preparation reserves up to the upload bound plus two expanded packages
(just over 3 GiB), in addition to the configured free-space margin. This bounds
concurrent disk activity while receiving, normalizing and publishing large discs.
Changing a BIOS publishes another immutable package and retains the old release;
it can consume another full disc's space. Delete an unused old release through
the impact-confirmation screen to reclaim its unshared files and user histories.
HTTP receipt and socket inactivity both allow 15 minutes: a quiet socket during
streamed ZIP preparation must not be mistaken for an abandoned upload. Configure
any reverse proxy to allow this processing time as well as the upload size.

Applications hold a shared PostgreSQL storage lease for their lifetime. Maintenance
requires an exclusive lease, so it fails while an app is active; apps likewise
refuse to start during maintenance. The lease uses one dedicated database connection
per process. A disconnected lease must fail the process rather than leave it serving
writes without the lock. Do not bypass these entrypoints with ad-hoc blob writers.

The per-user quota counts logical retained bytes. Physical disk usage can differ
because of deduplication and abandoned writes. Monitor both disk capacity and
`GET /api/storage`. History is retained; adjusting limits requires an operator
decision. Collection does not free logical quota consumed by retained history.

## Consistent backup

Choose a private backup directory outside the repository. Keep the application's
`.env`/secret-manager values with the backup under appropriate access restrictions.

```sh
docker compose stop app
docker compose run --rm -T app node dist/storage/maintain-storage.js verify
docker compose exec -T database pg_dump -U retro -d retro -Fc --no-owner --no-acl > /private/backup/database.dump
docker compose run --rm -T --no-deps app tar -C /data -czf - . > /private/backup/data.tar.gz
docker compose up -d --wait app
```

Do not resume the app until both captures succeed. The data archive includes the
game catalog/assets and immutable saves; the database includes users, sessions,
profiles and revisions. Copying only one is not a recoverable backup. Preserve the
application version and runtime lock with the backup so snapshots remain compatible.

## Restore drill

Restore into a **new Compose project with fresh volumes**, never over a running
installation. Use the saved credentials and application image/version. Give the
drill a separate `APP_PORT` and matching `APP_ORIGIN` if the original is still up.

1. Start its database so the normal initializer creates the restricted `retro` role.
2. Feed `database.dump` to `pg_restore -U retro -d retro --no-owner --no-acl` inside
   that project's database container.
3. Feed `data.tar.gz` to `tar -C /data -xzf -` in an app one-shot container, as the
   normal `node` user, while the app service is stopped.
4. Run `maintain-storage verify`, start the app, log in, download a known revision
   and compare its bytes/checksum. Start a game and confirm its progress loads.
5. Retain the original backup until the drill and intended upgrade are accepted.

Only extract archives produced by this backup procedure from trusted storage.
Operator backups contain private data. Do not publish them as sample game bundles.
