import { access } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { reclaimHistory } from "../../src/storage/history-reclamation.ts";
import { updateQuotas } from "../../src/storage/quota-settings.ts";
import { migrateStorage } from "../../src/storage/schema.ts";
import { siteUsage } from "../../src/storage/site-quota.ts";
import { historyFixture } from "./history-fixture.ts";

let f: Awaited<ReturnType<typeof historyFixture>>;
const release = `dos-${"a".repeat(64)}`;
beforeEach(async () => {
  f = await historyFixture();
});
afterEach(async () => f.close());
function save(profile: string, base: string | null, value: number, size = 1) {
  return f.service.publish(
    "alice",
    profile,
    base,
    { kind: "filesystem", releaseId: release },
    [
      { name: "INDEX.DAT", bytes: Uint8Array.of(7) },
      { name: "SLOTS.DAT", bytes: new Uint8Array(size).fill(value) },
    ],
    "game",
  );
}
it("replaces a complete DOS group at the exact account and site limits and reclaims only unshared bytes", async () => {
  const p = await f.repository.create("alice", release, "DOS");
  await updateQuotas(f.database, 0, {
    account: { bytes: 2, revisions: 1, profiles: 1 },
    site: { bytes: 2, revisions: 1 },
  });
  const first = await save(p.id, null, 1);
  await expect(save(p.id, first.id, 4, 3)).rejects.toMatchObject({ code: "quota_exceeded" });
  const race = await Promise.allSettled([save(p.id, first.id, 2), save(p.id, first.id, 3)]);
  expect(race.filter((r) => r.status === "rejected")).toMatchObject([
    { reason: { code: "conflict" } },
  ]);
  const history = await f.repository.history("alice", p.id);
  expect(history).toHaveLength(1);
  const head = history[0];
  const retired = first.manifest.artifacts[1];
  if (!head || !retired) throw new Error("Missing DOS test data");
  expect(head.id).not.toBe(first.id);
  expect(head.parentId).toBeNull();
  expect(await siteUsage(f.database)).toEqual({ bytes: 2, revisions: 1 });
  await f.activity.run(true, () => reclaimHistory(f.database, f.directory));
  await expect(access(join(f.directory, "blobs", retired.sha256))).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(await f.service.file("alice", head.id, "INDEX.DAT")).toEqual(Buffer.of(7));
  expect([2, 3]).toContain((await f.service.file("alice", head.id, "SLOTS.DAT"))[0]);
  await f.repository.protect("alice", head.id, false, true);
  await expect(save(p.id, head.id, 9)).rejects.toMatchObject({ code: "quota_exceeded" });
  expect(await f.repository.history("alice", p.id)).toEqual([{ ...head, protected: true }]);
});

it("keeps pre-upgrade DOS history as backups and restores the entire group", async () => {
  const p = await f.repository.create("alice", release, "Migration");
  const old = await save(p.id, null, 8);
  await f.database.query("DELETE FROM schema_versions WHERE version=7");
  await migrateStorage(f.database);
  const a = await save(p.id, old.id, 9);
  const b = await save(p.id, a.id, 10);
  const restored = await f.service.restore("alice", p.id, b.id, old.id);
  expect(restored.parentId).toBe(b.id);
  expect((await f.repository.read("alice", restored.id)).parentId).toBe(old.id);
  expect(restored.manifest).toEqual(old.manifest);
  expect((await f.repository.history("alice", p.id)).map((x) => [x.id, x.protected])).toEqual([
    [restored.id, false],
    [old.id, true],
  ]);
  await migrateStorage(f.database);
  expect((await f.repository.read("alice", restored.id)).protected).toBe(false);
});
