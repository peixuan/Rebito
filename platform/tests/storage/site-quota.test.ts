import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SaveService } from "../../src/saves/service.ts";
import { LocalBlobStore } from "../../src/storage/blobs.ts";
import { reclaimHistory } from "../../src/storage/history-reclamation.ts";
import { deleteProfile, profileDeletionImpact } from "../../src/storage/profile-deletion.ts";
import { RevisionRepository } from "../../src/storage/revisions.ts";
import { migrateStorage } from "../../src/storage/schema.ts";
import { siteUsage } from "../../src/storage/site-quota.ts";
import { historyFixture } from "./history-fixture.ts";

let fixture: Awaited<ReturnType<typeof historyFixture>>;
beforeEach(async () => {
  fixture = await historyFixture();
});
afterEach(async () => fixture?.close());

it("serializes two owners at the site limit and reclaims the losing upload", async () => {
  const { database, directory } = fixture;
  const repository = new RevisionRepository(database, fixture.repository.limits, {
    bytes: 1,
    revisions: 10,
  });
  const blobs = new LocalBlobStore(join(directory, "blobs"), 0);
  const service = new SaveService(repository, blobs);
  const owners = ["alice", "bob"] as const;
  const profiles = await Promise.all([
    repository.create("alice", "test-game", "Alice"),
    repository.create("bob", "test-game", "Bob"),
  ]);
  // Both requests finish preflight before either can commit, even on a fast database.
  const store = blobs.put.bind(blobs);
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writers = 0;
  vi.spyOn(blobs, "put").mockImplementation(async (bytes) => {
    if (++writers === 2) release();
    await ready;
    return store(bytes);
  });
  const save = (index: 0 | 1) =>
    service.publish(
      owners[index],
      profiles[index].id,
      null,
      { kind: "game-save", releaseId: "test-game" },
      [{ name: "save.dat", bytes: Uint8Array.of(index) }],
      "game",
    );
  const results = await Promise.allSettled([save(0), save(1)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "site_quota_exceeded" },
  });
  const win = results[0]?.status === "fulfilled" ? 0 : 1;
  const lose = win === 0 ? 1 : 0;
  expect(await siteUsage(database)).toEqual({ bytes: 1, revisions: 1 });
  expect(await repository.history(owners[lose], profiles[lose].id)).toEqual([]);
  expect(await fixture.activity.run(true, () => reclaimHistory(database, directory))).toEqual({
    reclaimedBytes: 1,
    pendingFiles: 0,
  });
  const [head] = await repository.history(owners[win], profiles[win].id);
  if (!head) throw new Error("Missing winning save");
  expect(await service.file(owners[win], head.id, "save.dat")).toEqual(Buffer.from([win]));
  await expect(
    service.restore(owners[win], profiles[win].id, head.id, head.id),
  ).rejects.toMatchObject({ code: "site_quota_exceeded" });
  await expect(save(lose)).rejects.toMatchObject({ code: "site_quota_exceeded" });
  expect(writers).toBe(2);
  const impact = await profileDeletionImpact(database, owners[win], profiles[win].id);
  await fixture.activity.run(true, () =>
    deleteProfile(database, owners[win], profiles[win].id, impact.token),
  );
  expect(await siteUsage(database)).toEqual({ bytes: 0, revisions: 0 });
  expect((await save(lose)).source).toBe("game");
});

it("bounds metadata even when every saved file is empty", async () => {
  const { database, directory, repository } = fixture;
  const limited = new RevisionRepository(database, repository.limits, {
    bytes: 1024,
    revisions: 1,
  });
  const service = new SaveService(limited, new LocalBlobStore(join(directory, "blobs"), 0));
  const profile = await repository.create("alice", "test-game", "Empty file");
  const head = await service.publish(
    "alice",
    profile.id,
    null,
    { kind: "game-save", releaseId: "test-game" },
    [{ name: "empty.dat", bytes: new Uint8Array() }],
    "game",
  );
  await expect(service.restore("alice", profile.id, head.id, head.id)).rejects.toMatchObject({
    code: "site_quota_exceeded",
  });
  expect(await siteUsage(database)).toEqual({ bytes: 0, revisions: 1 });
});

it("backfills existing history including protected and deduplicated revisions exactly once", async () => {
  const { database, repository } = fixture;
  const profile = await repository.create("alice", "test-game", "Existing");
  const first = await fixture.append(profile.id, null, 42);
  await repository.protect("alice", first.id, false, true);
  await fixture.service.restore("alice", profile.id, first.id, first.id);
  await database.query(`DROP TRIGGER revision_usage ON revisions; DROP FUNCTION account_revision_bytes();
    DROP FUNCTION revision_bytes(jsonb); DROP TABLE site_save_usage;
    DELETE FROM schema_versions WHERE version=5`);
  await migrateStorage(database);
  await migrateStorage(database);
  expect(await siteUsage(database)).toEqual({ bytes: 2, revisions: 2 });
  expect(await fixture.service.file("alice", first.id, "save.dat")).toEqual(Buffer.from([42]));
});
