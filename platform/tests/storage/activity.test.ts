import { afterAll, beforeAll, expect, it } from "vitest";
import { StorageActivity } from "../../src/storage/activity.ts";
import { testDatabase } from "../database.ts";

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let first: StorageActivity;
let second: StorageActivity;
beforeAll(async () => {
  fixture = await testDatabase();
  first = await StorageActivity.open(fixture.database);
  second = await StorageActivity.open(fixture.database);
});
afterAll(async () => {
  await first?.close();
  await second?.close();
  await fixture?.close();
});

it("allows concurrent readers, excludes cross-instance reclamation and releases after failures", async () => {
  const started = signal();
  const finish = signal();
  const reader = first.run(false, async () => {
    started.resolve();
    await finish.promise;
  });
  await started.promise;
  expect(await second.run(false, async () => "read")).toBe("read");
  const events: string[] = [];
  const writer = second.run(true, async () => {
    events.push("delete");
    throw new Error("failed");
  });
  // Observe PostgreSQL waiting, instead of assuming a fixed delay proves exclusion.
  await expect
    .poll(
      async () =>
        (
          await fixture.database.query(
            "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted AND objid=4",
          )
        ).rows[0].count,
    )
    .toBe("1");
  expect(events).toEqual([]);
  const rejected = expect(writer).rejects.toThrow("failed");
  finish.resolve();
  await reader;
  await rejected;
  expect(await first.run(false, async () => "after")).toBe("after");
});

it("does not let new local readers starve a queued writer", async () => {
  const started = signal();
  const finish = signal();
  const events: string[] = [];
  const read = first.run(false, async () => {
    started.resolve();
    await finish.promise;
  });
  await started.promise;
  const write = first.run(true, async () => {
    events.push("write");
  });
  const next = first.run(false, async () => {
    events.push("read");
  });
  finish.resolve();
  await Promise.all([read, write, next]);
  expect(events).toEqual(["write", "read"]);
});
