import { afterEach, beforeEach, expect, it } from "vitest";
import { reclaimHistory } from "../../src/storage/history-reclamation.ts";
import { deleteProfile, profileDeletionImpact } from "../../src/storage/profile-deletion.ts";
import { historyFixture } from "./history-fixture.ts";

let fixture: Awaited<ReturnType<typeof historyFixture>>;
beforeEach(async () => {
  fixture = await historyFixture();
});
afterEach(async () => fixture?.close());
const impact = (owner: string, id: string) => profileDeletionImpact(fixture.database, owner, id);
const remove = (owner: string, id: string, token: string) =>
  fixture.activity.run(true, () => deleteProfile(fixture.database, owner, id, token));

it("rejects foreign access and refreshes confirmation after a save or protection change", async () => {
  const profile = await fixture.repository.create("alice", "test-game", "Campaign");
  const empty = await impact("alice", profile.id);
  expect(empty).toMatchObject({ revisions: 0, protectedRevisions: 0 });
  await expect(impact("bob", profile.id)).rejects.toMatchObject({ code: "not_found" });
  await expect(remove("bob", profile.id, empty.token)).rejects.toMatchObject({ code: "not_found" });
  const first = await fixture.append(profile.id, null, 42);
  await expect(remove("alice", profile.id, empty.token)).rejects.toMatchObject({
    code: "conflict",
  });
  const beforeProtection = await impact("alice", profile.id);
  await fixture.repository.protect("alice", first.id, false, true);
  await expect(remove("alice", profile.id, beforeProtection.token)).rejects.toMatchObject({
    code: "conflict",
  });
  expect(await impact("alice", profile.id)).toMatchObject({ revisions: 1, protectedRevisions: 1 });
  expect(await fixture.service.file("alice", first.id, "save.dat")).toEqual(Buffer.from([42]));
});

it("deletes the confirmed profile and releases unique bytes while retaining another user's copy", async () => {
  const a = await fixture.repository.create("alice", "test-game", "Remove");
  const b = await fixture.repository.create("bob", "test-game", "Keep");
  const unique = await fixture.append(a.id, null, 1);
  await fixture.append(a.id, unique.id, 2);
  const shared = await fixture.append(b.id, null, 2, "bob");
  const confirmed = await impact("alice", a.id);
  await remove("alice", a.id, confirmed.token);
  await expect(remove("alice", a.id, confirmed.token)).rejects.toMatchObject({ code: "not_found" });
  expect((await fixture.repository.usage("alice")).used).toEqual({
    profiles: 0,
    revisions: 0,
    bytes: 0,
  });
  expect(
    await fixture.activity.run(true, () => reclaimHistory(fixture.database, fixture.directory)),
  ).toEqual({ reclaimedBytes: 1, pendingFiles: 0 });
  expect(await fixture.service.file("bob", shared.id, "save.dat")).toEqual(Buffer.from([2]));
});
