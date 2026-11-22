import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { jinyongAdapter } from "../../src/editors/jinyong/adapter.ts";
import { findEntry } from "../../src/library/configuration.ts";
import { withCatalog, writeCatalog } from "../../src/library/transaction.ts";
import { SaveService } from "../../src/saves/service.ts";
import { loadConfig } from "../../src/server/config.ts";
import { createPlatform } from "../../src/server/platform.ts";
import { LocalBlobStore } from "../../src/storage/blobs.ts";
import { RevisionRepository } from "../../src/storage/revisions.ts";
import { testDatabase } from "../database.ts";
import { jinyongFixture } from "./jinyong-fixture.ts";
import { seedEditor } from "./library-fixture.ts";

let database: Awaited<ReturnType<typeof testDatabase>>;
let app: Awaited<ReturnType<typeof createPlatform>>;
let saves: SaveService;
let directory: string;
let releaseId: string;
const users: { id: string; cookie: string }[] = [];
const origin = "http://localhost:3000";
beforeAll(async () => {
  database = await testDatabase();
  directory = await mkdtemp(join(tmpdir(), "rebito-jinyong-"));
  releaseId = await seedEditor(directory, "jinyong");
  const library = join(directory, "library");
  await withCatalog(library, async (catalog) => {
    // Even an administrator's mistaken sync declaration must not expose initial data.
    findEntry(catalog, releaseId).saveFiles.push("RANGER.GRP");
    await writeCatalog(library, catalog);
  });
  app = await createPlatform(
    loadConfig({
      APP_ORIGIN: origin,
      DATABASE_URL: "postgresql://unused/unused",
      AUTH_SECRET: randomBytes(32).toString("hex"),
      DATA_DIR: directory,
      ALLOW_REGISTRATION: "true",
    }),
    database.database,
  );
  saves = new SaveService(
    new RevisionRepository(database.database),
    new LocalBlobStore(join(directory, "blobs")),
  );
  for (const name of ["alice", "bob"]) {
    const result = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin },
      payload: { name, email: `${name}@example.test`, password: "integration-password-123" },
    });
    expect(result.statusCode).toBe(200);
    users.push({
      id: result.json().user.id,
      cookie: result.cookies.map(({ name, value }) => `${name}=${value}`).join("; "),
    });
  }
}, 30_000);
afterAll(async () => {
  await app?.close();
  await database?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function original() {
  const owner = users[0]?.id ?? "";
  const profile = await saves.revisions.create(owner, releaseId, "Original DOS");
  const files = [1, 2, 3].flatMap((slot) => [
    { name: `R${slot}.GRP`, bytes: jinyongFixture() },
    { name: `S${slot}.GRP`, bytes: Uint8Array.of(slot, 2, 3) },
    { name: `D${slot}.GRP`, bytes: Uint8Array.of(slot, 4, 5) },
  ]);
  files.push({ name: "RANGER.GRP", bytes: jinyongFixture() });
  return saves.publish(owner, profile.id, null, { kind: "game-save", releaseId }, files, "game");
}
function request(id: string, payload: object, publish = false, user = 0) {
  return app.inject({
    method: "POST",
    url: `/api/revisions/${id}/editor${publish ? "" : "/preview"}`,
    headers: { origin, cookie: users[user]?.cookie ?? "" },
    payload,
  });
}
const edit = (file: string, amount: number) => ({
  file,
  edits: [{ slot: 0, changes: { "inventory.174.quantity": amount } }],
});

it("lists only native R saves and keeps preview private and read-only", async () => {
  const revision = await original();
  const result = await request(revision.id, { file: "R2.GRP", changes: { "person.0.health": 99 } });
  expect(result.statusCode).toBe(200);
  expect(result.json()).toMatchObject({ file: "R2.GRP", files: ["R1.GRP", "R2.GRP", "R3.GRP"] });
  expect(result.headers["cache-control"]).toBe("no-store");
  expect(await saves.revisions.history(users[0]?.id ?? "", revision.profileId)).toHaveLength(1);
  for (const file of ["RANGER.GRP", "S1.GRP", "D1.GRP", "../R1.GRP"])
    expect((await request(revision.id, { file })).json().error).toBe("no_editable_save");
  expect((await request(revision.id, {}, false, 1)).statusCode).toBe(404);
  expect((await request(revision.id, edit("R1.GRP", 99), true, 1)).statusCode).toBe(404);
});

it("publishes three slots atomically, preserving every companion and old revision", async () => {
  const originalRevision = await original();
  const files = [1, 2, 3].map((slot) => edit(`R${slot}.GRP`, slot * 123));
  const result = await request(originalRevision.id, { files }, true);
  expect(result.statusCode).toBe(201);
  expect(result.json()).toMatchObject({ parentId: originalRevision.id, source: "editor" });
  for (const artifact of originalRevision.manifest.artifacts) {
    const expected = Buffer.from(
      await saves.file(users[0]?.id ?? "", originalRevision.id, artifact.name),
    );
    if (/^R[123]\.GRP$/.test(artifact.name))
      expected.writeInt16LE(Number(artifact.name[1]) * 123, 38);
    expect(
      Buffer.from(await saves.file(users[0]?.id ?? "", result.json().id, artifact.name)),
    ).toEqual(expected);
  }
  expect((await request(originalRevision.id, { files }, true)).statusCode).toBe(409);
  expect(
    await saves.revisions.history(users[0]?.id ?? "", originalRevision.profileId),
  ).toHaveLength(2);
});

it("rejects an invalid later file without writing any part of the group", async () => {
  const revision = await original();
  for (const later of [
    edit("R2.GRP", 30001),
    edit("RANGER.GRP", 50),
    { ...edit("R3.GRP", 50), edits: [{ slot: 1, changes: { "person.0.health": 50 } }] },
  ]) {
    expect(
      (await request(revision.id, { files: [edit("R1.GRP", 99), later] }, true)).statusCode,
    ).toBe(422);
    expect(await saves.revisions.history(users[0]?.id ?? "", revision.profileId)).toHaveLength(1);
    expect(Buffer.from(await saves.file(users[0]?.id ?? "", revision.id, "R1.GRP"))).toEqual(
      Buffer.from(jinyongFixture()),
    );
  }
});

it("admits only one writer and does not merge conflicting saves", async () => {
  const revision = await original();
  const results = await Promise.all([
    request(revision.id, edit("R1.GRP", 12), true),
    request(revision.id, edit("R1.GRP", 34), true),
  ]);
  expect(results.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409]);
  const winner = results.find(({ statusCode }) => statusCode === 201);
  const bytes = Buffer.from(await saves.file(users[0]?.id ?? "", winner?.json().id, "R1.GRP"));
  expect([12, 34]).toContain(bytes.readInt16LE(38));
  expect(await saves.revisions.history(users[0]?.id ?? "", revision.profileId)).toHaveLength(2);
});

it("publishes an expanded bag order atomically and rejects a competing draft", async () => {
  const revision = await original();
  const batches = [];
  for (const quantity of [5, 9]) {
    const preview = await request(revision.id, {
      file: "R1.GRP",
      module: "inventory",
      changes: { "inventory.1.quantity": quantity },
      action: { id: "top", record: "1" },
    });
    expect(preview.statusCode).toBe(200);
    batches.push({ file: "R1.GRP", edits: [{ slot: 0, changes: preview.json().changes }] });
  }
  expect((await request(revision.id, { files: [batches[0]] }, true, 1)).statusCode).toBe(404);
  const invalid = { file: "R2.GRP", edits: [{ slot: 0, changes: { "inventory.order.0": 200 } }] };
  expect((await request(revision.id, { files: [batches[0], invalid] }, true)).statusCode).toBe(422);
  expect(await saves.revisions.history(users[0]?.id ?? "", revision.profileId)).toHaveLength(1);
  const results = await Promise.all(
    batches.map((batch) => request(revision.id, { files: [batch] }, true)),
  );
  expect(results.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409]);
  const winner = results.findIndex(({ statusCode }) => statusCode === 201);
  const expected = jinyongAdapter.apply(jinyongFixture(), {
    changes: batches[winner]?.edits[0]?.changes,
  });
  const published = results[winner]?.json().id;
  for (const artifact of revision.manifest.artifacts) {
    const before = await saves.file(users[0]?.id ?? "", revision.id, artifact.name);
    const after = await saves.file(users[0]?.id ?? "", published, artifact.name);
    expect(Buffer.from(after)).toEqual(Buffer.from(artifact.name === "R1.GRP" ? expected : before));
  }
  expect(Buffer.from(await saves.file(users[0]?.id ?? "", revision.id, "R1.GRP"))).toEqual(
    Buffer.from(jinyongFixture()),
  );
});
