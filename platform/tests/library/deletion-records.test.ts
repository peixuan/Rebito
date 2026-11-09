import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createAuth } from "../../src/identity/auth.ts";
import { migrateIdentity } from "../../src/identity/migrate.ts";
import {
  beginDeletion,
  deletionImpact,
  pendingDeletions,
  referencedBlobs,
} from "../../src/library/deletion-records.ts";
import { loadConfig } from "../../src/server/config.ts";
import { RevisionRepository } from "../../src/storage/revisions.ts";
import { migrateStorage } from "../../src/storage/schema.ts";
import { testDatabase } from "../database.ts";

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let repository: RevisionRepository;
const owners: string[] = [];
const entry = {
  title: "Delete fixture",
  system: "nes" as const,
  file: "fixture.asset",
  sha256: "a".repeat(64),
  size: 50,
  saveFiles: [],
};
const id = `nes-${entry.sha256}`;
const catalog = { version: 1 as const, games: [entry] };
const shared = { name: "shared.sav", size: 3, sha256: "b".repeat(64) };
const unique = { name: "unique.sav", size: 7, sha256: "c".repeat(64) };
beforeAll(async () => {
  fixture = await testDatabase();
  const config = loadConfig({
    APP_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "postgresql://unused/unused",
    AUTH_SECRET: randomBytes(32).toString("hex"),
    ALLOW_REGISTRATION: "true",
  });
  await migrateIdentity(config, fixture.database);
  await migrateStorage(fixture.database);
  await migrateStorage(fixture.database);
  for (const name of ["a", "b"]) {
    const account = await createAuth(config, fixture.database).api.signUpEmail({
      body: { email: `${name}@example.test`, name, password: "delete-fixture-password" },
    });
    owners.push(account.user.id);
  }
  repository = new RevisionRepository(fixture.database);
});
afterAll(async () => {
  await fixture?.close();
});

it("counts all owners and history but excludes shared bytes from physical recovery", async () => {
  for (const owner of owners) {
    const profile = await repository.create(owner, id, "Progress");
    const first = await repository.publish(
      owner,
      profile.id,
      null,
      { kind: "game-save", releaseId: id, artifacts: [shared, unique] },
      "game",
    );
    await repository.publish(owner, profile.id, first.id, first.manifest, "restore");
  }
  const other = await repository.create(owners[0] ?? "", "other", "Other game");
  await repository.publish(
    owners[0] ?? "",
    other.id,
    null,
    { kind: "game-save", releaseId: "other", artifacts: [shared] },
    "game",
  );
  expect((await deletionImpact(fixture.database, catalog, entry)).preview).toMatchObject({
    users: 2,
    profiles: 2,
    revisions: 4,
    saveBytes: 40,
    reclaimableBytes: 57,
  });
});

it("rejects missing consent and stale previews before transactionally removing history", async () => {
  const { preview } = await deletionImpact(fixture.database, catalog, entry);
  for (const changes of [{ deleteSaves: false }, { title: "wrong" }, { token: "0".repeat(64) }]) {
    await expect(
      beginDeletion(fixture.database, catalog, entry, {
        token: preview.token,
        title: entry.title,
        deleteSaves: true,
        ...changes,
      }),
    ).rejects.toThrow();
  }
  const extra = await repository.create(owners[0] ?? "", id, "New progress after preview");
  await expect(
    beginDeletion(fixture.database, catalog, entry, {
      token: preview.token,
      title: entry.title,
      deleteSaves: true,
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
  const current = (await deletionImpact(fixture.database, catalog, entry)).preview;
  await beginDeletion(fixture.database, catalog, entry, {
    token: current.token,
    title: entry.title,
    deleteSaves: true,
  });
  expect(await repository.list(owners[0] ?? "")).toHaveLength(1);
  expect(await repository.list(owners[1] ?? "")).toHaveLength(0);
  await expect(repository.history(owners[0] ?? "", extra.id)).rejects.toMatchObject({
    code: "not_found",
  });
  expect(await referencedBlobs(fixture.database)).toEqual(new Set([shared.sha256]));
  expect(await pendingDeletions(fixture.database)).toHaveLength(1);
  expect((await repository.usage(owners[1] ?? "")).used).toEqual({
    profiles: 0,
    revisions: 0,
    bytes: 0,
  });
});
