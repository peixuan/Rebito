import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import { afterAll, beforeAll, expect, it } from "vitest";
import { releaseId as identifyRelease } from "../../src/library/catalog.ts";
import { findEntry } from "../../src/library/configuration.ts";
import { withCatalog, writeCatalog } from "../../src/library/transaction.ts";
import { SaveService } from "../../src/saves/service.ts";
import { loadConfig } from "../../src/server/config.ts";
import { createPlatform } from "../../src/server/platform.ts";
import { LocalBlobStore } from "../../src/storage/blobs.ts";
import { RevisionRepository } from "../../src/storage/revisions.ts";
import { testDatabase } from "../database.ts";
import { eiketsudenCompanion, eiketsudenFixture } from "./eiketsuden-fixture.ts";
import { eiketsudenRulesFixture } from "./eiketsuden-rules-fixture.ts";

let database: Awaited<ReturnType<typeof testDatabase>>;
let app: Awaited<ReturnType<typeof createPlatform>>;
let saves: SaveService;
let directory: string;
let releaseId: string;
const users: { id: string; cookie: string }[] = [];
const origin = "http://localhost:3000";
const primary = (slot: number) => (slot === 4 ? "saves/msave4.r3s" : `MSAVE${slot}.R3S`);
const companion = (slot: number) => (slot === 4 ? "saves/ESAVE4.R3S" : `ESAVE${slot}.R3S`);
const declarations = Array.from({ length: 5 }, (_, slot) => [primary(slot), companion(slot)])
  .flat()
  .map((name) => name.toLowerCase())
  .concat("msave.r3");

beforeAll(async () => {
  database = await testDatabase();
  directory = await mkdtemp(join(tmpdir(), "rebito-eiketsuden-"));
  const library = join(directory, "library");
  await mkdir(library);
  const bytes = zipSync({ "BAKDATA.R3": eiketsudenRulesFixture() });
  const entry = {
    title: "Synthetic Eiketsuden editor",
    system: "dos" as const,
    editor: "eiketsuden",
    file: "eiketsuden.fixture",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    saveFiles: declarations,
  };
  releaseId = identifyRelease(entry);
  await writeFile(join(library, entry.file), bytes);
  await writeFile(join(library, "catalog.json"), JSON.stringify({ version: 1, games: [entry] }));
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
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin },
      payload: { name, email: `${name}@example.test`, password: "integration-password-123" },
    });
    expect(response.statusCode).toBe(200);
    users.push({
      id: response.json().user.id,
      cookie: response.cookies.map(({ name, value }) => `${name}=${value}`).join("; "),
    });
  }
}, 30_000);
afterAll(async () => {
  await app?.close();
  await database?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

function nativeFiles() {
  const files = Array.from({ length: 5 }, (_, slot) => [
    { name: primary(slot), bytes: eiketsudenFixture() },
    // Companion lengths are intentionally opaque; the editor does not parse event state.
    { name: companion(slot), bytes: eiketsudenCompanion().subarray(0, slot === 4 ? 57 : 1369) },
  ]).flat();
  // The unnumbered resource shares the shape but is never an editable save.
  return [...files, { name: "MSAVE.R3", bytes: eiketsudenFixture() }];
}
async function original(files = nativeFiles()) {
  const owner = users[0]?.id ?? "";
  const profile = await saves.revisions.create(owner, releaseId, "Original DOS");
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
const edit = (slot: number, changes: Record<string, number> = { "campaign.0.money": 1234 }) => ({
  file: primary(slot),
  edits: [{ slot: 0, changes }],
});
const history = (profile: string) => saves.revisions.history(users[0]?.id ?? "", profile);

it("lists five native slots with complete groups and binds private game metadata", async () => {
  const revision = await original();
  const response = await request(revision.id, { file: primary(4) });
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.json()).toMatchObject({
    file: primary(4),
    files: Array.from({ length: 5 }, (_, slot) => primary(slot)),
    syncFiles: [primary(4), companion(4)],
    selected: "0",
    records: expect.arrayContaining([expect.objectContaining({ id: "0", label: "C00000" })]),
  });
  expect(response.json().fields).toContainEqual(
    expect.objectContaining({ key: "characters.0.strength", value: 1, readonly: true }),
  );
  expect(await history(revision.profileId)).toHaveLength(1);
  for (const file of ["MSAVE.R3", companion(0), "../MSAVE0.R3S"])
    expect((await request(revision.id, { file })).json().error).toBe("no_editable_save");
  expect((await request(revision.id, {}, false, 1)).statusCode).toBe(404);
  expect((await request(revision.id, edit(0), true, 1)).statusCode).toBe(404);
});

it("publishes five groups once and preserves opaque companions, unknown bytes and history", async () => {
  const source = nativeFiles();
  const first = source[0];
  if (!first) throw new Error("Missing fixture save");
  first.bytes[1702] = 254; // An unknown eighth item remains untouched.
  const revision = await original(source);
  await saves.revisions.protect(users[0]?.id ?? "", revision.id, false, true);
  const files = Array.from({ length: 5 }, (_, slot) =>
    edit(slot, { "campaign.0.money": 1000 + slot, "characters.0.level": 50 + slot }),
  );
  const response = await request(revision.id, { files }, true);
  expect(response.statusCode).toBe(201);
  expect(response.json()).toMatchObject({ parentId: revision.id, source: "editor" });
  for (const file of source) {
    const expected = Buffer.from(file.bytes);
    const slot = files.findIndex((entry) => entry.file === file.name);
    if (slot >= 0) {
      expected.writeUInt16LE(1000 + slot, 35);
      expected[1693] = 50 + slot;
    }
    expect(
      Buffer.from(await saves.file(users[0]?.id ?? "", response.json().id, file.name)),
    ).toEqual(expected);
    expect(Buffer.from(await saves.file(users[0]?.id ?? "", revision.id, file.name))).toEqual(
      Buffer.from(file.bytes),
    );
  }
  expect((await request(revision.id, { files }, true)).statusCode).toBe(409);
  expect(await history(revision.profileId)).toHaveLength(2);
});

it("rejects missing or undeclared companions without publishing any group", async () => {
  const revision = await original(nativeFiles().filter(({ name }) => name !== companion(4)));
  expect((await request(revision.id, { file: primary(4) })).json().error).toBe("no_editable_save");
  expect((await request(revision.id, { files: [edit(0), edit(4)] }, true)).statusCode).toBe(422);
  expect(await history(revision.profileId)).toHaveLength(1);
  const complete = await original();
  const library = join(directory, "library");
  async function declare(names: string[]) {
    await withCatalog(library, async (catalog) => {
      findEntry(catalog, releaseId).saveFiles = names;
      await writeCatalog(library, catalog);
    });
  }
  try {
    await declare(declarations.filter((name) => name !== companion(0).toLowerCase()));
    const fallback = await request(complete.id, {});
    expect(fallback.statusCode).toBe(200);
    expect(fallback.json()).toMatchObject({
      file: primary(1),
      files: [1, 2, 3, 4].map(primary),
      syncFiles: [primary(1), companion(1)],
    });
    expect((await request(complete.id, { file: primary(0) })).json().error).toBe(
      "no_editable_save",
    );
    expect((await request(complete.id, edit(0), true)).statusCode).toBe(422);
    expect(await history(complete.profileId)).toHaveLength(1);
  } finally {
    await declare(declarations);
  }
});

it("rejects malformed native data and invalid later edits atomically", async () => {
  const files = nativeFiles();
  const first = files[0];
  if (!first) throw new Error("Missing fixture save");
  first.bytes[1693] = 0;
  const malformed = await original(files);
  expect((await request(malformed.id, {})).json().error).toBe("invalid_save");
  const revision = await original();
  for (const changes of [
    { "characters.0.troops": 999 },
    { "characters.0.strength": 100 },
    { "characters.0.item0": 63 },
    { "characters.0.level": 100 },
    { "campaign.0.money": 10001 },
  ]) {
    expect(
      (await request(revision.id, { files: [edit(0), edit(4, changes)] }, true)).statusCode,
    ).toBe(422);
    expect(await history(revision.profileId)).toHaveLength(1);
  }
  expect((await request(revision.id, { slot: 1 })).statusCode).toBe(422);
});

it("admits one competing writer without rebasing or overwriting the winner", async () => {
  const revision = await original();
  const results = await Promise.all(
    [123, 456].map((value) => request(revision.id, edit(0, { "campaign.0.money": value }), true)),
  );
  expect(results.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409]);
  const winner = results.findIndex(({ statusCode }) => statusCode === 201);
  const bytes = Buffer.from(
    await saves.file(users[0]?.id ?? "", results[winner]?.json().id, primary(0)),
  );
  expect(bytes.readUInt16LE(35)).toBe([123, 456][winner]);
  expect(await history(revision.profileId)).toHaveLength(1);
});
