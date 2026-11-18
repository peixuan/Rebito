# Single-host deployment

This optional Linux deployment uses Docker Compose, Python 3.9+ and systemd.
GitHub runs CI; the host polls the public repository over HTTPS. There is no
incoming webhook, GitHub token, hosted image publication or persistent CI worker.
Network/API failures leave the running release unchanged.

`check_release.py` admits only protected `main`, with successful GitHub Actions
application checks for Node 24/26, repository policy, secret scan, container and
both CodeQL analyses. It checks the exact revision and rechecks the branch after
reading results. Missing, pending, failed or incomplete evidence denies admission.
Changing required job names requires an explicit update to this admission policy.

The cutover transaction closes proxy traffic, stops both services and captures
both persistent volumes. Only then may the candidate start and migrate data.
An unsuccessful startup restores that unpublished attempt before restarting the
old release. A durable journal allows the next invocation to recover interruptions.
If recovery fails, traffic stays closed and the backup/journal remain available.
The successful revision is recorded before opening traffic: subsequent recovery
must never restore old data over saves accepted by a published release.
Failed cutovers require an operator retry; the timer must not loop over them.
Fetch/build outages occur before cutover and can retry on the next timer tick.

`deploy.py` serializes deployments with a host lock. It fetches the admitted commit,
builds before stopping the old release, refuses automatic PostgreSQL image changes,
and checks free space. Backups capture cleanly stopped PostgreSQL and save volumes,
with checksums verified before restoration. It retains the current, previous and
failed release artifacts only; Docker's separate build-cache policy bounds cache.
These same-host rollback copies are not disaster recovery: keep encrypted off-site
backups separately. Recovery downtime includes copying the complete game library.

`restore_drill.py --platform /path/to/platform --image IMAGE` requires root on Linux
and an already-built image. It creates disposable, randomly named Compose resources,
mutates real database/file data during a rejected startup, verifies restoration and
then verifies a successful cutover and restart. CI runs this drill automatically.

Run the deployment tests from the repository root:

```sh
python3 -B -m unittest discover -s platform/deploy -p '*_test.py'
```

Deployment does not establish permission to redistribute emulator assets. Read
the [hosting and source obligations](../DEPLOYMENT.md#source-publication-and-public-hosting)
before exposing a deployment to users. Keep all host credentials and user data
outside the source checkout.

## Host setup

Use a dedicated Linux host with Docker/Compose, Git, Python 3.9+, GNU tar, Nginx
and Certbot. The service template assumes Docker's default `/var/lib/docker` root.
Two CPUs and 2 GiB RAM can run this small installation; builds need additional
headroom or swap. Limits in `compose.prod.yaml` reserve 512 MiB for the app and
384 MiB for PostgreSQL. They are ceilings, not measured steady-state usage.

1. Point the domain to the host. Allow SSH, TCP 80 for ACME and TCP 62001 for HTTPS
   in the cloud security group. Keep application port 3000 and PostgreSQL private.
2. Clone the public repository bare at `/opt/rebito/source.git`. With `umask 022`,
   create `/opt/rebito/releases/FULL_SHA` as a detached worktree of an admitted main
   revision. Public checkout files must be readable by container users. Do not put
   configuration, credentials or backups in a checkout.
3. Generate an environment file using the existing [deployment setup](../DEPLOYMENT.md),
   place it at `/etc/rebito/app.env` (root-owned, mode 0600), set the exact HTTPS
   `APP_ORIGIN`, closed registration and initial administrator credentials. Copy
   `compose.prod.yaml` to `/etc/rebito/`. Keep these database secrets stable.
4. Build `rebito-app:FULL_SHA` from that worktree's `platform/`. Export
   `REBITO_IMAGE=rebito-app:FULL_SHA` and use the same Compose command as below with
   `up -d --no-build --wait`. Verify login, then remove the `INITIAL_ADMIN_*` values
   and recreate the app. Verify that administrator access survives.
5. Obtain a certificate with Certbot's webroot method, adapt `nginx.conf.example`
   and test/reload Nginx. Enable the distribution's renewal timer and a deploy hook
   that runs `nginx -t && systemctl reload nginx`; verify `certbot renew --dry-run`.
6. Create `/var/lib/rebito` mode 0755 so Nginx can stat the maintenance marker;
   state and backup files stay private. Initialize root-only `release.json` with
   `{"current":"FULL_SHA"}`. Copy the reviewed Python modules into root-owned
   `/opt/rebito/deployer/`. The timer deliberately does not self-update its code.
7. Put `REBITO_REPOSITORY=owner/repository` in `/etc/rebito/deploy.env`. Install the
   service/timer in `/etc/systemd/system`, run `systemd-analyze verify` on them,
   then `systemctl daemon-reload` and `systemctl enable --now rebito-deploy.timer`.

The Compose command, including project name, must stay consistent:

```sh
export REBITO_IMAGE=rebito-app:FULL_SHA
docker compose -p rebito --env-file /etc/rebito/app.env \
  -f /opt/rebito/releases/FULL_SHA/platform/compose.yaml \
  -f /etc/rebito/compose.prod.yaml up -d --no-build --wait
```

Use `systemctl start rebito-deploy.service` for an immediate check and
`journalctl -u rebito-deploy.service` for results. Anonymous GitHub API limits and
outages defer deployment. No incoming webhook is needed. After diagnosing a failed
revision, stop the timer and run `python3 -B /opt/rebito/deployer/deploy.py
owner/repository --retry`, then restart the timer. Never remove a pending journal
or bypass maintenance to expose an unverified or partly restored database.

The service replaces application/database containers but never removes production
volumes. Do not run simultaneous operator imports, cleanup commands or additional
app replicas during deployment. The physical PostgreSQL rollback archive requires
the exact database image; version upgrades are manual maintenance operations.
The maintenance marker blocks new proxy requests; shutting down the app drains
existing connections. Verify an actual HTTP 503 while the marker exists.

Keep the existing [build-cache GC](../OPERATIONS.md#build-cache-retention), bounded
container logs and host journal/Nginx log rotation. Tune game/save quotas to leave
space for up to three complete rollback copies and an active build. The free-space
guard refuses an update instead of deleting user data when capacity is insufficient.
These copies protect cutovers, not disk loss or mistakes after a release is live.
