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
Failed candidates require an operator retry; the timer must not loop over them.

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
