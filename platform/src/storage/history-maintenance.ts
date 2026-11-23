import type { Pool } from "pg";
import type { StorageActivity } from "./activity.ts";
import { pruneHistory } from "./history.ts";
import { reclaimHistory } from "./history-reclamation.ts";
import type { StorageLimits } from "./limits.ts";

declare module "fastify" {
  interface FastifyContextConfig {
    rotateHistory?: boolean;
  }
}

/** Coalesce publication notifications without upgrading a request's shared lease.
 * Every batch yields the exclusive lease; close drains work before the lease closes.
 */
export class HistoryMaintenance {
  private pending: Promise<void> = Promise.resolve();
  private queued = false;
  private closed = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly database: Pool;
  private readonly activity: StorageActivity;
  private readonly directory: string;
  private readonly limits: StorageLimits;
  private readonly report: (error: unknown) => void;

  constructor(
    database: Pool,
    activity: StorageActivity,
    directory: string,
    limits: StorageLimits,
    report: (error: unknown) => void,
  ) {
    this.database = database;
    this.activity = activity;
    this.directory = directory;
    this.limits = limits;
    this.report = report;
  }

  start() {
    if (this.timer || this.closed) return;
    this.timer = setInterval(() => void this.request(), 60_000);
    this.timer.unref();
    void this.request();
  }

  request(): Promise<void> {
    if (this.closed || this.queued) return this.pending;
    this.queued = true;
    this.pending = this.pending.then(async () => {
      this.queued = false;
      if (this.closed) return;
      try {
        const more = await this.activity.run(true, async () => {
          const owners = await this.database.query<{ owner_id: string }>(
            "SELECT DISTINCT p.owner_id FROM profiles p JOIN revisions r ON r.profile_id=p.id WHERE NOT r.protected ORDER BY p.owner_id",
          );
          for (const { owner_id } of owners.rows) {
            try {
              await pruneHistory(this.database, owner_id, this.limits);
            } catch (error) {
              this.report(error); // One damaged account must not prevent another's rotation.
            }
          }
          return (await reclaimHistory(this.database, this.directory)).pendingFiles > 0;
        });
        if (more) void this.request();
      } catch (error) {
        this.report(error); // Retry on the next publication or interval, never spin on disk errors.
      }
    });
    return this.pending;
  }

  async close() {
    this.closed = true;
    clearInterval(this.timer);
    await this.pending;
  }
}
