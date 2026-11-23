import { afterAll, beforeAll, expect, it } from "vitest";
import { historyFixture } from "./history-fixture.ts";

let fixture: Awaited<ReturnType<typeof historyFixture>>;
beforeAll(async () => {
  fixture = await historyFixture();
});
afterAll(async () => {
  await fixture?.close();
});

it("pages tied and sub-millisecond timestamps without skipping protected checkpoints", async () => {
  const profile = await fixture.repository.create("alice", "test-game", "Old checkpoints");
  let head: string | null = null;
  for (let index = 0; index < 103; index++) {
    const revision = await fixture.append(profile.id, head, index);
    head = revision.id;
  }
  await fixture.database.query(
    "UPDATE revisions SET created_at='2026-01-01 00:00:00.000123+00', protected=true WHERE profile_id=$1",
    [profile.id],
  );
  const first = await fixture.repository.history("alice", profile.id);
  expect(first).toHaveLength(100);
  const cursor = first.at(-1);
  if (!cursor) throw new Error("Missing cursor");
  // This row sorts just after the cursor but has the same JavaScript millisecond.
  await fixture.database.query(
    "UPDATE revisions SET created_at='2026-01-01 00:00:00.000122+00' WHERE id=$1",
    [first[0]?.id],
  );
  const next = await fixture.repository.history("alice", profile.id, cursor.id);
  expect(next).toHaveLength(4);
  expect(next.at(-1)?.id).toBe(first[0]?.id);
  expect(next.every((revision) => revision.protected)).toBe(true);
  expect(new Set([...first, ...next].map((revision) => revision.id)).size).toBe(103);
  expect(await fixture.repository.history("alice", profile.id, next.at(-1)?.id)).toEqual([]);
  await expect(fixture.repository.history("bob", profile.id, cursor.id)).rejects.toMatchObject({
    code: "not_found",
  });
  const other = await fixture.repository.create("alice", "test-game", "Other profile");
  await expect(fixture.repository.history("alice", other.id, cursor.id)).rejects.toMatchObject({
    code: "not_found",
  });
});

it("rejects a pruned cursor instead of silently skipping history", async () => {
  const profile = await fixture.repository.create("alice", "test-game", "Pruned cursor");
  const revision = await fixture.append(profile.id, null, 1);
  await fixture.database.query("UPDATE profiles SET head_id=NULL WHERE id=$1", [profile.id]);
  await fixture.database.query("DELETE FROM revisions WHERE id=$1", [revision.id]);
  await expect(fixture.repository.history("alice", profile.id, revision.id)).rejects.toMatchObject({
    code: "not_found",
  });
});
