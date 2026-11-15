export class UploadBusyError extends Error {}

type Waiter = { admit(): void };

/** Bounds buffered multipart bodies; waiting requests leave their streams unread. */
export class UploadQueue {
  private active = 0;
  private readonly waiting: Waiter[] = [];
  private readonly concurrency: number;
  private readonly capacity: number;
  private readonly waitMs: number;

  constructor(concurrency = 2, capacity = 8, waitMs = 15_000) {
    this.concurrency = concurrency;
    this.capacity = capacity;
    this.waitMs = waitMs;
  }

  async run<T>(signal: AbortSignal, action: () => Promise<T>): Promise<T> {
    await this.acquire(signal);
    try {
      signal.throwIfAborted();
      return await action();
    } finally {
      // A disconnected client does not cancel an in-flight database publication.
      // Hold its slot until the action settles, including failed writes.
      this.active--;
      this.waiting.shift()?.admit();
    }
  }

  private async acquire(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (this.active < this.concurrency) {
      this.active++;
      return;
    }
    if (this.waiting.length >= this.capacity) throw new UploadBusyError();
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", aborted);
      };
      const cancel = (error: unknown) => {
        this.waiting.splice(this.waiting.indexOf(waiter), 1);
        cleanup();
        reject(error);
      };
      const aborted = () => cancel(signal.reason);
      const waiter: Waiter = {
        admit: () => {
          cleanup();
          this.active++;
          resolve();
        },
      };
      const timer = setTimeout(() => cancel(new UploadBusyError()), this.waitMs);
      signal.addEventListener("abort", aborted, { once: true });
      this.waiting.push(waiter);
    });
  }
}
