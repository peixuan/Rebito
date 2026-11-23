import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { historyPlan, pruneHistory } from "../../src/storage/history.ts";
import { reclaimHistory } from "../../src/storage/history-reclamation.ts";
import type { Revision } from "../../src/storage/revisions.ts";
import { historyFixture } from "./history-fixture.ts";

let fixture: Awaited<ReturnType<typeof historyFixture>>;
beforeEach(async () => {
  fixture = await historyFixture();
});
afterEach(async () => {
  await fixture?.close();
});
async function series(count = 6) {
  const profile = await fixture.repository.create("alice", "test-game", "Retention");
  const revisions: Revision[] = [];
  for (let index = 0; index < count; index++)
    revisions.push(await fixture.append(profile.id, revisions.at(-1)?.id ?? null, index));
  return { profile, revisions };
}
const plan = (profileId?: string) =>
  historyPlan(fixture.database, "alice", fixture.repository.limits, profileId);
const prune = (profileId: string, token: string) =>
  fixture.activity.run(true, () =>
    pruneHistory(fixture.database, "alice", fixture.repository.limits, { profileId, token }),
  );

it("compacts ancestry, protects heads and points, and counts shared physical bytes once", async () => {
  const { profile, revisions } = await series();
  const [first, shared] = revisions;
  if (!first || !shared) throw new Error("Missing history");
  await fixture.repository.protect("alice", first.id, false, true);
  const other = await fixture.repository.create("bob", "test-game", "Shared");
  const kept = await fixture.append(other.id, null, 1, "bob");
  const { preview } = await plan(profile.id);
  expect(preview).toMatchObject({
    logicalBytes: 3,
    reclaimableBytes: 2,
    protectedRevisions: 1,
    remainingAccountBytes: 3,
  });
  await prune(profile.id, preview.token);
  const history = await fixture.repository.history("alice", profile.id);
  expect(history.map((row) => row.id)).toEqual([
    revisions.at(-1)?.id,
    revisions.at(-2)?.id,
    first.id,
  ]);
  expect(history[1]?.parentId).toBe(first.id);
  expect(history[0]?.manifest).toEqual(revisions.at(-1)?.manifest);
  expect((await fixture.repository.list("alice"))[0]?.headId).toBe(revisions.at(-1)?.id);
  expect((await fixture.database.query("SELECT * FROM history_cleanup")).rowCount).toBe(3);
  const result = await fixture.activity.run(true, () =>
    reclaimHistory(fixture.database, fixture.directory),
  );
  expect(result).toEqual({ reclaimedBytes: 2, pendingFiles: 0 });
  expect(await fixture.service.file("bob", kept.id, "save.dat")).toEqual(Buffer.from([1]));
  expect(await readdir(join(fixture.directory, "blobs"))).toHaveLength(4);
});

it("rejects foreign profiles and stale protection or head confirmations", async () => {
  const { profile, revisions } = await series();
  const first = revisions[0];
  if (!first) throw new Error("Missing history");
  await expect(
    historyPlan(fixture.database, "bob", fixture.repository.limits, profile.id),
  ).rejects.toMatchObject({ code: "not_found" });
  const before = await plan(profile.id);
  await fixture.repository.protect("alice", first.id, false, true);
  await expect(prune(profile.id, before.preview.token)).rejects.toMatchObject({ code: "conflict" });
  const updated = await plan(profile.id);
  await fixture.append(profile.id, revisions.at(-1)?.id ?? null, 20);
  await expect(prune(profile.id, updated.preview.token)).rejects.toMatchObject({
    code: "conflict",
  });
  expect(await fixture.repository.history("alice", profile.id)).toHaveLength(7);
  expect((await fixture.database.query("SELECT * FROM history_cleanup")).rowCount).toBe(0);
});

it("rolls back reparenting and cleanup intent when metadata deletion fails", async () => {
  const { profile } = await series();
  const before = await fixture.repository.history("alice", profile.id);
  const { preview } = await plan(profile.id);
  await fixture.database.query(`CREATE FUNCTION fail_history_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected deletion failure'; END $$;
    CREATE TRIGGER fail_history_delete BEFORE DELETE ON revisions FOR EACH ROW EXECUTE FUNCTION fail_history_delete()`);
  await expect(prune(profile.id, preview.token)).rejects.toThrow("injected deletion failure");
  expect(await fixture.repository.history("alice", profile.id)).toEqual(before);
  expect((await fixture.database.query("SELECT * FROM history_cleanup")).rowCount).toBe(0);
  await fixture.database.query(
    "DROP TRIGGER fail_history_delete ON revisions; DROP FUNCTION fail_history_delete()",
  );
  await prune(profile.id, preview.token);
  expect(await fixture.repository.history("alice", profile.id)).toHaveLength(2);
});

it("retains interrupted reclamation and rechecks newly shared references on retry", async () => {
  const { profile } = await series();
  await prune(profile.id, (await plan(profile.id)).preview.token);
  await expect(
    fixture.activity.run(true, () =>
      reclaimHistory(fixture.database, fixture.directory, undefined, async () => {
        throw new Error("unlink interrupted");
      }),
    ),
  ).rejects.toThrow("unlink interrupted");
  expect((await fixture.database.query("SELECT * FROM history_cleanup")).rowCount).toBe(4);
  const other = await fixture.repository.create("bob", "test-game", "New shared reference");
  const kept = await fixture.append(other.id, null, 2, "bob");
  expect(
    await fixture.activity.run(true, () => reclaimHistory(fixture.database, fixture.directory)),
  ).toEqual({ reclaimedBytes: 3, pendingFiles: 0 });
  expect(await fixture.service.file("bob", kept.id, "save.dat")).toEqual(Buffer.from([2]));
  await expect(
    fixture.service.publish(
      "alice",
      profile.id,
      null,
      { kind: "game-save", releaseId: "test-game" },
      [{ name: "save.dat", bytes: Uint8Array.of(22) }],
      "game",
    ),
  ).rejects.toMatchObject({ code: "conflict" });
});

it("serializes cleanup against a save without rebasing or replacing its bytes", async () => {
  const { profile, revisions } = await series();
  const { preview } = await plan(profile.id);
  const results = await Promise.all([
    prune(profile.id, preview.token),
    fixture.activity.run(false, () => fixture.append(profile.id, revisions.at(-1)?.id ?? null, 31)),
  ]);
  const saved = results[1];
  expect((await fixture.repository.list("alice"))[0]?.headId).toBe(saved.id);
  expect(saved.parentId).toBe(revisions.at(-1)?.id);
  expect(await fixture.service.file("alice", saved.id, "save.dat")).toEqual(Buffer.from([31]));
  expect(await fixture.repository.history("alice", profile.id)).toHaveLength(3);
  expect((await plan(profile.id)).preview.logicalBytes).toBe(1);
});
