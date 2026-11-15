# Five-user save queue acceptance

Date: 2026-11-15. Application changes: `b5c9fa3`, `1d39192`. This retests the
[2026-11-13 baseline](CAPACITY.md) after bounded admission and browser retry.

## Tested behavior

- Two active multipart collections, at most eight FIFO waiters, 15-second
  admission timeout; unread waiting streams do not allocate complete save bodies.
- Only explicit pre-publication `503 upload_busy` is automatically retried by the
  browser: four retries at most, backoff/jitter, `Retry-After`, and a 60-second
  scheduling budget. Captured bytes and the original base revision are reused.
- Conflicts, uncertain transport results, authentication and quota failures are
  not blindly retried. Paused local runtime/files remain available for recovery;
  the cloud head is never silently adopted as a new upload base.
- Queue overflow/expiry creates no revision. Disconnecting an active client does
  not release its memory slot until the publication settles. Queued disconnects
  are removed. No new queue service, dependency or database schema is introduced.

See [synchronization invariants](../../platform/SYNCHRONIZATION.md). A hard browser
termination still cannot guarantee recovery of unpublished data: no durable
offline outbox is implemented.

## Resource experiment

The disposable app/database project shares `cpu.max=200000 100000`, CPU affinity
`0-1`, `memory.max=1610612736` and `memory.swap.max=0`. The app retains its existing
512 MiB ceiling and has no swap or automatic container restart. Another 512 MiB
is reserved for Linux/Docker/TLS outside the measured cgroup, giving the proposed
2 GiB deployment budget. Node is 24.22.3; PostgreSQL is 18.7.

Only immutable game assets are copied from the original deployment. Five new
accounts download the same 497.14 MiB Mega CD package and publish unique random
save collections. The tracked `platform/scripts/load-five-users.mjs` verifies
accepted bytes, exact history membership and other-account denial. These binary
payloads test persistence, not emulator compatibility. CPU/RAM are sampled every
100 ms; CPU percentages use the full two-CPU budget, with one-second peaks.
The generator and browser players remain outside the server budget.

| Scenario | Saves | Total peak MiB | CPU average / peak | Download p95 | Save p95 | Initial rejection |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 256 KiB + five downloads | 25 | 1116.5 | 6.5% / 84.4% | 8.03 s | 0.28 s | 0 |
| 8 MiB + five downloads | 25 | 563.5 | 16.5% / 76.1% | 8.30 s | 0.70 s | 0 |
| 64 MiB uploads only | 15 | 560.3 | 20.9% / 63.1% | — | 4.51 s | 0 |
| 64 MiB + five downloads | 15 | 587.1 | 32.9% / 82.1% | 14.33 s | 5.38 s | 0 |
| 256 KiB + downloads, 100 Mbit/s | 40 | 580.5 | 6.0% / 25.5% | 218.12 s | 1.80 s | 0 |

The first scenario includes cache charged to the parent during one-shot library
copying: before load the parent had 654.8 MiB charged, while the app/database
together had 149.7 MiB. Its aggregate anonymous memory peaked at only 122.9 MiB.
The table retains the full parent charge instead of subtracting this setup cache.
Later scenarios reclaimed it. Thus the first peak must not be interpreted as an
equivalent growth in the app's heap or compared directly with a warm-cache baseline.

The largest combined case reached 445.2 MiB of app anonymous memory and metadata
latency p95 of 1.35 s. Cache reclaim at the app limit remains visible; increasing
upload parallelism would reduce that headroom. All five completed cases have zero
OOM events/kills and pass save hashes, history and ownership checks.

All 120 API saves succeeded on their first HTTP attempt; the probe's fallback
retry was never used. The previous baseline rejected 72 of these first attempts.
Under 100 Mbit/s shaping, all five downloads still took about 218 seconds, while
save p95 fell from 4.16 to 1.80 seconds. The link remains the download bottleneck.

This is a local WSL Linux experiment, not an Alibaba Cloud host/TLS acceptance.
Network/disk performance and the host reserve still require validation on the
purchased machine. Reproduction and isolated `tc` bandwidth shaping are documented
in the original [capacity procedure](CAPACITY.md#reproducing-the-http-probe).

## Real browsers and failure recovery

Five independent Chrome contexts with `chromiumSandbox: true` launched the real
Mega CD game in 30.17–30.61 seconds on the unshaped local network. Their capture
requests were released at a barrier: all five returned 201, with 0.56–0.71-second
save completion. Each capture was 1,634,296 bytes. A second round deliberately
injected one `503 upload_busy` per browser; all five automatically retried and
finished in 1.84–1.99 seconds. Manual retries: zero. All profiles had exactly two
revisions, all downloaded artifacts matched their hashes, and all runtimes stayed
present. Browser errors: zero. Service memory peaked at 575.6 MiB; CPU average/peak
was 13.5% / 84.7% of the two-CPU budget. The injected busy responses test the
browser fallback, separately from the first round's real server admission.

Verification commands used PostgreSQL 18.7 via `PG_TEST_URL`, with
`PLAYWRIGHT_CHANNEL=chrome` for browser tests:

- `npm run check`: lint, server/client types, 311 unit/integration cases, coverage
  (98.05% lines, 92.41% branches) and production build passed.
- `npm run test:e2e`: 43 full regression cases passed. After strengthening the
  capture-count assertion and adding lost-response coverage,
  `npx playwright test tests/e2e/save-retry.spec.ts` passed all three final cases
  (44 distinct browser cases across both runs).
- Real DOS tests prove one capture across retries, automatic/exit-save completion,
  preservation of both local and remote branches during a queued conflict, and
  no repost after a committed response is lost. Queue integration tests use real
  PostgreSQL and HTTP disconnects; admission overflow/timeout and quota/ownership
  checks are also covered. Fault injection is explicitly distinguished from the
  real five-player runs above.
- `node scripts/dependency-policy.mjs`: all 280 locked package metadata records
  passed the existing policy; this is not a complete public-release license audit.

## Persistence and local deployment

After stopping the test app and restarting PostgreSQL, offline integrity
verification found 130 revisions, 127 unique referenced blobs and no orphans.
All 30 profiles and all revision metadata matched across restart. The test app
became ready. Test containers, network, volumes (2,773,556 KiB) and the cgroup unit
were removed after checking project labels and effective limits.

The local service was upgraded after a stopped-app database/file backup and a
restore drill into separate volumes. All 28 physical files, three real profiles
and 25 revision records matched before/after restore and upgrade. Sandboxed Chrome
loaded the restored Mega CD profile, with unchanged history and no browser errors.
The old image and consistent private backup were retained; drill volumes were
removed. These private backups and game/test artifacts are not Git content.
