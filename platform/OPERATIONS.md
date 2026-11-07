# Storage maintenance and recovery

Use the same application image/configuration as the deployment. All commands below
run from `platform/` in a POSIX shell. Binary output redirection must preserve bytes;
on Windows, run these commands in WSL rather than an older PowerShell pipeline.

## Integrity verification and abandoned files

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
