import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HistoryMaintenance } from "../../src/storage/history-maintenance.ts";
import * as reclamation from "../../src/storage/history-reclamation.ts";
import { deferred } from "../deferred.ts";
import { historyFixture } from "./history-fixture.ts";

let fixture: Awaited<ReturnType<typeof historyFixture>>;
let worker: HistoryMaintenance;
const report = vi.fn();
beforeEach(async () => {
  fixture = await historyFixture();
  report.mockClear();
  worker = new HistoryMaintenance(
    fixture.database,
    fixture.activity,
    fixture.directory,
    fixture.repository.limits,
    report,
  );
});
afterEach(async () => {
  await worker?.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
  await fixture?.close();
});
async function prepare(count = 15) {
  const profile = await fixture.repository.create("alice", "test-game", "Rolling history");
  let head: string | null = null;
  for (let index = 0; index < count; index++)
    head = (await fixture.append(profile.id, head, index)).id;
  return { profile, head };
}

it("rotates after a notification while retaining recent and protected usable points", async () => {
  const { profile, head } = await prepare();
  const oldest = (await fixture.repository.history("alice", profile.id)).at(-1);
  if (!oldest) throw new Error("Missing history");
  await fixture.repository.protect("alice", oldest.id, false, true);
  await Promise.all([worker.request(), worker.request(), worker.request()]);
  const history = await fixture.repository.history("alice", profile.id);
  expect(history).toHaveLength(11);
  expect(history[0]?.id).toBe(head);
  expect(await readdir(join(fixture.directory, "blobs"))).toHaveLength(11);
  for (const revision of history)
    expect(await fixture.service.file("alice", revision.id, "save.dat")).toHaveLength(1);
  expect(report).not.toHaveBeenCalled();
});

it("continues bounded reclamation batches until the durable queue drains", async () => {
  const { profile } = await prepare(140);
  const reclaim = vi.spyOn(reclamation, "reclaimHistory");
  await worker.request();
  await vi.waitFor(async () => {
    expect((await fixture.database.query("SELECT * FROM history_cleanup")).rowCount).toBe(0);
  });
  expect(reclaim).toHaveBeenCalledTimes(2);
  expect(await fixture.repository.history("alice", profile.id)).toHaveLength(10);
  expect(await readdir(join(fixture.directory, "blobs"))).toHaveLength(10);
});

it("waits for active readers and drains a queued batch before closing its lease", async () => {
  const { profile } = await prepare();
  const entered = deferred();
  const release = deferred();
  const reading = fixture.activity.run(false, async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const sweep = worker.request();
  expect(await fixture.repository.history("alice", profile.id)).toHaveLength(15);
  let closed = false;
  const closing = worker.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  release.resolve();
  await Promise.all([reading, sweep, closing]);
  expect(closed).toBe(true);
  expect(await fixture.repository.history("alice", profile.id)).toHaveLength(10);
  await fixture.append(
    profile.id,
    (await fixture.repository.history("alice", profile.id))[0]?.id ?? null,
    55,
  );
  await worker.request();
  expect(await fixture.repository.history("alice", profile.id)).toHaveLength(11);
});

it("retains failed work and retries it on the background interval", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const { profile } = await prepare();
  const reclaim = vi
    .spyOn(reclamation, "reclaimHistory")
    .mockRejectedValueOnce(new Error("disk offline"));
  worker.start();
  await worker.request();
  expect(report).toHaveBeenCalledTimes(1);
  expect((await fixture.database.query("SELECT * FROM history_cleanup")).rowCount).toBe(5);
  expect(await fixture.repository.history("alice", profile.id)).toHaveLength(10);
  await vi.advanceTimersByTimeAsync(60_000);
  await vi.waitFor(async () => {
    expect((await fixture.database.query("SELECT * FROM history_cleanup")).rowCount).toBe(0);
  });
  expect(reclaim).toHaveBeenCalledTimes(2);
  expect(await readdir(join(fixture.directory, "blobs"))).toHaveLength(10);
});
