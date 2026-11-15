# Five-user capacity acceptance

Historical baseline. The [2026-11-15 save-queue retest](CAPACITY_SAVE_QUEUE.md)
supersedes the save-admission limitation and retry follow-up below.

Date: 2026-11-13. Application baseline: `12d5080` (Node 24.22.3, PostgreSQL 18.7).

## Scope and resource budget

This is a local Linux resource-limit experiment, not acceptance on an Alibaba
Cloud instance. Five separate accounts use the real HTTP/auth/storage stack.
Only immutable game assets/catalog were copied into a disposable Compose project;
production accounts, profiles and save files were not used as load-test targets.

The app and database share one systemd cgroup with these verified kernel values:

| Setting | Effective value |
| --- | --- |
| Aggregate CPU quota (`cpu.max`) | `200000 100000`, two CPU-seconds per second |
| Allowed logical CPUs | `0-1` (siblings on an Intel Xeon W-2295) |
| Aggregate memory ceiling | 1,536 MiB |
| Swap allowance | 0 |
| Application's existing memory ceiling | 512 MiB |
| Additional host budget | 512 MiB reserved for Linux, Docker and a future TLS proxy |

The 512 MiB host allowance is a sizing reserve, not measured OS confinement.
The host is WSL2 Linux 6.18.33.2 with a local virtual disk. HTTP load generators
run outside the service cgroup, pinned to logical CPUs 2-7. Chrome also runs
outside it, representing users' computers. TLS, WAN latency/loss, actual cloud
CPU scheduling and cloud-disk performance are not covered by this experiment.
The existing app limit and upload admission rules are unchanged; automatic
container restart is disabled in the test project so a crash cannot be hidden.

## Workload and measurement

- Every download reads the operator-supplied 521,285,753-byte Mega CD game package
  (497.14 MiB). Five transfers start together; each client checks length and SHA-256.
  Only the test copy's file cache is advised away before download scenarios;
  the host-wide page cache is never dropped.
- API save payloads are unique random binary data: 256 KiB ordinary saves, 8 MiB
  snapshots by size, and the 64 MiB maximum collection boundary. They exercise
  server persistence, not game-format validity or emulator state restoration.
- Five uploads start together in each round. The probe records every first-attempt
  rejection. Only explicit `503 upload_busy` responses are retried, using
  `Retry-After` plus a small per-client stagger. This is probe behavior, not a claim
  that the current browser automatically retries failed saves.
- An authenticated metadata request runs every second during the workload.
  Every accepted save is subsequently downloaded and hash checked, and a different
  account is denied access. History must contain exactly the accepted revisions.
- Cgroup memory and CPU counters are sampled every 100 ms. Memory peaks include
  page cache/kernel charges; anonymous memory is recorded separately. CPU average
  covers the full run, including setup/verification, and peaks use one-second
  windows. CPU percentages are relative to the combined two-CPU budget.
- Session setup respects authentication rate limits. Rapid logins from one source
  produced a 429; waiting for the permitted retry completed all five logins.
  This is distinct from upload admission or CPU/memory capacity.

## API results

Times below are p95, measured per operation. Sync time includes explicit retries.
Unshaped transfers use the local network and must not be treated as cloud speeds.

| Scenario | Save rounds / interval | Memory peak MiB | CPU average / peak | Download p95 | Sync p95 | First upload rejection |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 256 KiB + five downloads | 5 / 30 s | 576.4 | 6.2% / 82.3% | 7.78 s | 1.48 s | 15 / 25 |
| 8 MiB + five downloads | 5 / 10 s | 571.5 | 16.1% / 80.1% | 8.10 s | 1.81 s | 15 / 25 |
| 64 MiB uploads only | 3 / 10 s | 578.1 | 20.2% / 71.0% | — | 5.42 s | 9 / 15 |
| 64 MiB + five downloads | 3 / 10 s | 564.3 | 31.2% / 77.3% | 13.97 s | 5.58 s | 9 / 15 |
| 256 KiB + downloads, 100 Mbit/s | 8 / 30 s | 568.4 | 5.9% / 21.6% | 218.12 s | 4.16 s | 24 / 40 |

All completed scenarios above have zero OOM kills and successful byte/ownership
checks. The 64 MiB combined case reaches about 459 MiB of app anonymous memory;
the app repeatedly reclaims cache at its 512 MiB ceiling. The metadata p95 is
492 ms and maximum 1.27 s there, compared with 75 ms / 122 ms for ordinary saves.
`memory.events:max` includes those reclaim events; it is not an OOM count.

The 100 Mbit/s scenario delivered five complete games while accepting all 40 saves
after retries. Metadata p95 was 244 ms. Traffic shaping reported 2,737,446,330 bytes
including protocol/other traffic and no packet drops. The 218-second completion
time reflects shared bandwidth; it does not indicate a CPU or RAM shortage.

## Real browsers and persistence

Five independent Chrome contexts, all launched with `chromiumSandbox: true`,
opened the real Mega CD game through the existing UI. All reached the live controls
guide in 29.9-30.4 seconds on the unshaped local network. Browser errors: zero.
The test held the five captured save requests at a client-side barrier and released
them together. Two returned 201; three returned `503 upload_busy`. For those three,
the UI showed its retry message and retained the running iframe. Clicking Save
again after the wait published successfully. Every profile had exactly one revision;
each actual capture was 1,634,296 bytes and all downloaded artifact hashes matched.
No automatic browser retry or emulator restart/restore is claimed for this probe.

During this browser acceptance, combined service memory peaked at 560.3 MiB and
CPU at 85.4% of the two-CPU budget (12.7% average). Player emulation/rendering and
its memory reside on the clients, outside the server budget.

After all tests, the test app stopped and PostgreSQL restarted. Offline integrity
verification checked 125 revisions and 125 unique referenced blobs, with no orphan
files. All 33 test profile records and revision metadata matched across restart;
the restarted app became ready. The original deployment remained ready, and its
existing baseline game/save hashes still matched. The disposable containers,
network, volumes (2,770,852 KiB) and cgroup unit were then removed. This frees files
inside WSL; it is not a claim that the Windows virtual-disk file was compacted.

## Sizing decision and remaining bottlenecks

The measured workloads support **two vCPUs and 2 GiB as an initial five-user
deployment size**. The highest sampled service memory was 578.1 MiB including
cache, plus the separately reserved 512 MiB host allowance. No OOM kill, container
crash, corrupted accepted save or ownership violation occurred.

This is not seamless five-at-once save acceptance: the existing global limit of
two concurrent uploads rejected 72 of 120 initial API attempts, and three of five
real browser saves. Extra hardware does not change this configured admission rule.
A follow-up should add bounded waiting/retry that preserves base-revision checks
and uncommitted local progress. Large 64 MiB collections already exert pressure
on the app's 512 MiB ceiling, so raising upload concurrency needs fresh memory tests.

For ordinary saves and the observed 1.56 MiB console captures, bandwidth and save
admission dominate this small-user scenario. Keep image builds on a development/CI
machine. Validate TLS, real cloud-disk I/O and the purchased network plan on the
target host before treating this local estimate as a cloud performance guarantee.
Future Windows disk synchronization is outside the tested workload.

## Reproducing the HTTP probe

Use a disposable deployment and five operator-created accounts. Never aim the
probe at a user's actual progress. Run from `platform/` with Node 24 or later:

```sh
node scripts/load-five-users.mjs < /private/load-config.json
```

The private JSON configuration contains `origin`, `gameId`, `output`, and `users`
(exactly five objects with `email` and `password`). Optional fields are `saveBytes`
(default 262144), `rounds` (5), `intervalMs` (30000), and `download` (true).
The probe creates new profiles and requires capacity for every retained test
revision. Raw outputs and credentials stay outside Git. Game files are never
fixtures committed to the repository.

Apply aggregate limits through a dedicated systemd slice and set `cgroup_parent`
to that slice on both Compose services. Set `CPUQuota=200%`, `AllowedCPUs=0-1`,
`MemoryMax=1536M`, `MemorySwapMax=0`; keep the app's 512 MiB memory limit and set
its `memswap_limit` to 512 MiB. Verify the effective files under `/sys/fs/cgroup/`
before load. Do not change the production project's limits or global WSL settings.
Read `memory.current`, `memory.stat`, `memory.events`, and `cpu.stat` for the parent
and each container cgroup. This avoids mistaking host RAM for the workload budget.

For the bandwidth case, apply `tc tbf` only inside the test app's network namespace:
100 Mbit/s, 256 KiB burst, 200 ms maximum queue latency. This bounds all app NIC
egress, including small database requests; it is not a full WAN emulator. Remove
the qdisc before other scenarios. Cleanup must verify the test project's Docker
labels before removing its volumes, then stop its dedicated slice.
