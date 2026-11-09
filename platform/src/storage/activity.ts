import type { FastifyInstance } from "fastify";
import type { Pool, PoolClient } from "pg";

type Waiter = { exclusive: boolean; resolve: () => void; reject: (error: unknown) => void };

/** One dedicated connection shares a reader lease across concurrent local handlers.
 * This avoids exhausting the query pool with one lock connection per request.
 * Writers wait for complete handlers/streams across every application instance.
 */
export class StorageActivity {
  private readonly client: PoolClient;
  private readonly queue: Waiter[] = [];
  private active = 0;
  private held = false;
  private exclusive = false;
  private pending: Promise<void> = Promise.resolve();
  private failure: unknown;

  private constructor(client: PoolClient) {
    this.client = client;
  }

  static async open(database: Pool) {
    const client = await database.connect();
    return new StorageActivity(client);
  }

  async run<T>(exclusive: boolean, action: () => Promise<T>): Promise<T> {
    if (this.failure) throw this.failure;
    await new Promise<void>((resolve, reject) => {
      this.queue.push({ exclusive, resolve, reject });
      this.schedule();
    });
    try {
      return await action();
    } finally {
      this.active--;
      this.schedule();
    }
  }

  private schedule() {
    this.pending = this.pending
      .then(() => this.advance())
      .catch((error: unknown) => {
        this.failure = error;
        for (const waiter of this.queue.splice(0)) waiter.reject(error);
      });
  }

  private async advance() {
    if (this.failure) throw this.failure;
    if (this.active === 0 && this.held) {
      await this.client.query(
        `SELECT pg_advisory_unlock${this.exclusive ? "" : "_shared"}(740721, 4)`,
      );
      this.held = false;
    }
    if (!this.queue.length) return;
    if (!this.held) {
      this.exclusive = this.queue[0]?.exclusive ?? false;
      await this.client.query(
        `SELECT pg_advisory_lock${this.exclusive ? "" : "_shared"}(740721, 4)`,
      );
      this.held = true;
    }
    // A waiting writer stops new local readers from overtaking it.
    while (this.queue.length && (!this.active || (!this.exclusive && !this.queue[0]?.exclusive))) {
      this.active++;
      this.queue.shift()?.resolve();
      if (this.exclusive) break;
    }
  }

  async close() {
    await this.pending;
    if (this.active || this.queue.length) throw new Error("Storage handlers are still active");
    this.failure = new Error("Storage activity is closed");
    this.client.release(this.held); // Destroy a connection if a failed unlock retained a lock.
  }
}

declare module "fastify" {
  interface FastifyContextConfig {
    exclusiveStorage?: boolean;
  }
}

/** Authentication/body validation still precede the handler; aborted handlers finish
 * their work before releasing the lease. Awaiting a returned reply also awaits streams.
 */
export function guardStorageRoutes(app: FastifyInstance, activity: StorageActivity) {
  app.addHook("onRoute", (route) => {
    const handler = route.handler;
    route.handler = async function (request, reply) {
      return activity.run(Boolean(route.config?.exclusiveStorage), async () =>
        handler.call(this, request, reply),
      );
    };
  });
}
