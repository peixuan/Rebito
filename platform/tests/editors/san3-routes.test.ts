import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { runtimeIdentities } from "../../scripts/runtime-identities.ts";
import { releaseId as identifyRelease } from "../../src/library/catalog.ts";
import { type SaveMetadata, SaveService } from "../../src/saves/service.ts";
import { loadConfig } from "../../src/server/config.ts";
import { createPlatform } from "../../src/server/platform.ts";
import { LocalBlobStore } from "../../src/storage/blobs.ts";
import { RevisionRepository } from "../../src/storage/revisions.ts";
import { testDatabase } from "../database.ts";
import { discArchive, discBios } from "../library/segacd-fixtures.ts";

const lock = JSON.parse(readFileSync(new URL("../../runtime-lock.json", import.meta.url), "utf8"));
const runtime = {
  adapter: "emulatorjs",
  core: "picodrive",
  version: runtimeIdentities(lock).picodrive ?? "",
};
const stateFile = "__runtime/state.bin";
const origin = "http://localhost:3000";
const users: { id: string; cookie: string }[] = [];
let database: Awaited<ReturnType<typeof testDatabase>>;
let app: Awaited<ReturnType<typeof createPlatform>>;
let saves: SaveService;
let directory: string;
let releaseId: string;

/** Original structural fixture: no game code, names, BIOS or player progress. */
function programRam(overlay = 0) {
  const bytes = Buffer.alloc(0x80000);
  bytes.write("KOEI", 0x78000);
  bytes.write("KOEI", 0x78776);
  bytes.writeUInt16BE(200, 0x78788);
  bytes.writeUInt16BE(overlay, 0x4abc4);
  for (let index = 0; index < 21; index++) bytes.writeUInt16BE(0xffff, 0x79148 + index * 50);
  bytes.writeUInt16BE(0, 0x79148);
  bytes.writeUInt32BE(0x787c4, 0x7914a);
  for (let index = 0; index < 46; index++) {
    const offset = 0x787c4 + index * 52;
    for (const relative of [4, 6, 8, 10]) bytes.writeUInt16BE(0xffff, offset + relative);
    bytes[offset + 20] = index === 0 ? 0 : 0xff;
    bytes.writeUInt16BE(700, offset + 12);
    bytes.writeUInt16BE(1500, offset + 14);
    bytes.writeUInt32BE(25_000, offset + 16);
  }
  for (let index = 0; index < 600; index++) bytes[0x79562 + index * 30 + 12] = 7;
  for (const index of [0, 1]) {
    const offset = 0x79562 + index * 30;
    bytes[offset + 12] = index === 0 ? 0 : 3;
    bytes[offset + 15] = 94;
    bytes.writeUInt16BE(2000, offset + 2);
    bytes[0x4021e + index * 30 + 5] = 70;
  }
  return bytes;
}

// Independently encoded container: it is deliberately not a playable emulator state.
function snapshot(ram = programRam()) {
  const coreSize = 1_560_538;
  const coreEnd = 16 + Math.ceil(coreSize / 8) * 8;
  const bytes = Buffer.alloc(coreEnd + 24, 0xa5);
  bytes.write("RASTATE\x01MEM ");
  bytes.writeUInt32LE(coreSize, 12);
  bytes.write("PicoSEXT", 16);
  bytes.writeUInt32LE(0x191, 24);
  let offset = 28;
  let programOffset = 0;
  for (const [id, size] of [
    [2, 0x10000],
    [13, 0x80000],
    [14, 0x40000],
    [16, 0x2000],
  ] as const) {
    bytes[offset] = id;
    bytes.writeUInt32LE(size, offset + 1);
    if (id === 13) {
      programOffset = offset + 5;
      for (let index = 0; index < ram.length; index++)
        bytes[programOffset + (index ^ 1)] = ram[index] ?? 0;
    }
    offset += 5 + size;
  }
  bytes.fill(0, offset, offset + 5);
  bytes.write("ACHV", coreEnd);
  bytes.writeUInt32LE(5, coreEnd + 4);
  bytes.set([8, 6, 7, 5, 3], coreEnd + 8);
  bytes.write("END ", coreEnd + 16);
  bytes.writeUInt32LE(0, coreEnd + 20);
  return { bytes, programOffset };
}

beforeAll(async () => {
  database = await testDatabase();
  directory = await mkdtemp(join(tmpdir(), "rebito-san3-editor-"));
  const library = join(directory, "library");
  await mkdir(library);
  const bytes = discArchive(undefined, { "bios_CD_J.bin": discBios() });
  const entry = {
    title: "Synthetic CD editor fixture",
    system: "segacd" as const,
    file: "fixture.zip",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    saveFiles: [],
    editor: "san3",
  };
  await writeFile(join(library, entry.file), bytes);
  await writeFile(join(library, "catalog.json"), JSON.stringify({ version: 1, games: [entry] }));
  releaseId = identifyRelease(entry);
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

async function original(bytes = snapshot().bytes, metadata: Partial<SaveMetadata> = {}) {
  const owner = users[0]?.id ?? "";
  const profile = await saves.revisions.create(owner, releaseId, "CD editor");
  return saves.publish(
    owner,
    profile.id,
    null,
    { kind: "snapshot", releaseId, runtime, ...metadata },
    [
      { name: stateFile, bytes },
      { name: "save.srm", bytes: new Uint8Array(73_728).fill(0x71) },
      { name: "__runtime/opaque.bin", bytes: Uint8Array.of(99, 88, 77) },
    ],
    "game",
  );
}
function request(id: string, payload: object, publish = false, user = 0) {
  return app.inject({
    method: "POST",
    url: `/api/revisions/${id}/editor${publish ? "" : "/preview"}`,
    headers: { origin, cookie: users[user]?.cookie ?? "" },
    payload,
  });
}
const batch = (changes: Record<string, number>) => ({
  file: stateFile,
  edits: [{ slot: 0, changes }],
});
const history = (profile: string) => saves.revisions.history(users[0]?.id ?? "", profile);

it("publishes only strategic PRG bytes and preserves native saves, other memory and identity", async () => {
  const source = snapshot();
  const initial = await original(source.bytes);
  const changes = { "city.0.population": 1234, "officer.1.loyalty": 89 };
  const preview = await request(initial.id, { module: "cities", changes });
  expect(preview.statusCode).toBe(200);
  expect(preview.headers["cache-control"]).toBe("no-store");
  expect(preview.json()).toMatchObject({ file: stateFile, files: [stateFile], changes });
  expect(preview.json().preview).toContainEqual(
    expect.objectContaining({ key: "city.0.population", before: 70_000, after: 123_400 }),
  );
  expect(await history(initial.profileId)).toHaveLength(1);
  const result = await request(initial.id, batch(changes), true);
  expect(result.statusCode).toBe(201);
  expect(result.json()).toMatchObject({
    parentId: initial.id,
    source: "editor",
    manifest: { kind: "snapshot", releaseId, runtime },
  });
  const expected = Buffer.from(source.bytes);
  expected[source.programOffset + (0x787d0 ^ 1)] = 0x04;
  expected[source.programOffset + (0x787d1 ^ 1)] = 0xd2;
  expected[source.programOffset + ((0x79562 + 30 + 15) ^ 1)] = 89;
  for (const artifact of initial.manifest.artifacts) {
    const before = await saves.file(users[0]?.id ?? "", initial.id, artifact.name);
    const after = await saves.file(users[0]?.id ?? "", result.json().id, artifact.name);
    expect(Buffer.from(after)).toEqual(
      artifact.name === stateFile ? expected : Buffer.from(before),
    );
    if (artifact.name !== stateFile)
      expect(
        result
          .json()
          .manifest.artifacts.find((entry: { name: string }) => entry.name === artifact.name),
      ).toEqual(artifact);
  }
  expect(Buffer.from(await saves.file(users[0]?.id ?? "", initial.id, stateFile))).toEqual(
    source.bytes,
  );
  expect(await history(initial.profileId)).toHaveLength(2);
  expect((await request(initial.id, batch({ "city.0.gold": 99 }), true)).statusCode).toBe(409);
});

it("authorizes the owner before exposing or editing a captured CD game", async () => {
  const initial = await original();
  expect((await request(initial.id, {}, false, 1)).statusCode).toBe(404);
  expect((await request(initial.id, batch({ "city.0.gold": 99 }), true, 1)).statusCode).toBe(404);
  expect(await history(initial.profileId)).toHaveLength(1);
  for (const file of ["save.srm", "__runtime/opaque.bin"])
    expect((await request(initial.id, { file })).json().error).toBe("no_editable_save");
});

it("requires initialized strategic data in the reviewed PicoDrive snapshot format", async () => {
  for (const overlay of [1, 2, 3, 4]) {
    const initial = await original(snapshot(programRam(overlay)).bytes);
    expect((await request(initial.id, {})).json().error).toBe("invalid_save");
    expect((await request(initial.id, batch({ "city.0.gold": 99 }), true)).json().error).toBe(
      "invalid_save",
    );
    expect(await history(initial.profileId)).toHaveLength(1);
  }
  const uninitialized = programRam();
  uninitialized.writeUInt16BE(0, 0x78788);
  const invalid = await original(snapshot(uninitialized).bytes);
  expect((await request(invalid.id, {})).json().error).toBe("invalid_save");
  for (const metadata of [
    { runtime: { ...runtime, core: "genesis_plus_gx" } },
    { runtime: { ...runtime, version: "unreviewed-build" } },
    { kind: "game-save" as const },
  ]) {
    const initial = await original(snapshot().bytes, metadata);
    const error = metadata.kind ? "no_editable_save" : "unsupported_editor";
    expect((await request(initial.id, {})).json().error).toBe(error);
    expect((await request(initial.id, batch({ "city.0.gold": 99 }), true)).json().error).toBe(
      error,
    );
    expect(await history(initial.profileId)).toHaveLength(1);
  }
});

it("rejects unsupported fields and invalid batches without partially publishing", async () => {
  const initial = await original();
  const before = await saves.file(users[0]?.id ?? "", initial.id, stateFile);
  for (const changes of [
    { "city.0.gold": 50_001 },
    { "city.0.faction": 1 },
    { "context.ruler": 1 },
    { "officer.0.loyalty": 99 },
    { "officer.1.soldiers": 0 },
    { "officer.1.soldiers": 17_001 },
    { "officer.2.training": 50 },
  ]) {
    const mixed = { "city.0.food": 123_456, ...changes };
    expect((await request(initial.id, { changes: mixed })).statusCode).toBe(422);
    expect((await request(initial.id, batch(mixed), true)).statusCode).toBe(422);
    expect(await history(initial.profileId)).toHaveLength(1);
  }
  expect(await saves.file(users[0]?.id ?? "", initial.id, stateFile)).toEqual(before);
});

it("publishes one whole competing edit and never rebases the losing city values", async () => {
  const initial = await original();
  const candidates = [
    { "city.0.population": 1111, "city.0.food": 111_111 },
    { "city.0.population": 2222, "city.0.food": 222_222 },
  ];
  const results = await Promise.all(
    candidates.map((changes) => request(initial.id, batch(changes), true)),
  );
  expect(results.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409]);
  const winner = results.findIndex(({ statusCode }) => statusCode === 201);
  const preview = await request(results[winner]?.json().id, { module: "cities", record: "0" });
  expect(preview.statusCode).toBe(200);
  const fields = Object.fromEntries(
    preview.json().fields.map((field: { key: string; value: number }) => [field.key, field.value]),
  );
  expect(fields).toMatchObject(candidates[winner] ?? {});
  expect(await history(initial.profileId)).toHaveLength(2);
});
