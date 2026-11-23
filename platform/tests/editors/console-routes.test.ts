import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { runtimeIdentities } from "../../scripts/runtime-identities.ts";
import { releaseId as identifyRelease } from "../../src/library/catalog.ts";
import { changeConfiguration, entryToken, findEntry } from "../../src/library/configuration.ts";
import { withCatalog, writeCatalog } from "../../src/library/transaction.ts";
import { type SaveMetadata, SaveService } from "../../src/saves/service.ts";
import { loadConfig } from "../../src/server/config.ts";
import { createPlatform } from "../../src/server/platform.ts";
import { LocalBlobStore } from "../../src/storage/blobs.ts";
import { RevisionRepository } from "../../src/storage/revisions.ts";
import { testDatabase } from "../database.ts";
import { mdFixture } from "../library/sega-fixtures.ts";
import { phantasyStar4Fixture } from "./phantasy-star4-fixture.ts";

const lock = JSON.parse(readFileSync(new URL("../../runtime-lock.json", import.meta.url), "utf8"));
const runtime = {
  adapter: "emulatorjs",
  core: "genesis_plus_gx",
  version: runtimeIdentities(lock).genesis_plus_gx ?? "",
};
const stateFile = "__runtime/state.bin";
const origin = "http://localhost:3000";
const users: { id: string; cookie: string }[] = [];
let database: Awaited<ReturnType<typeof testDatabase>>;
let app: Awaited<ReturnType<typeof createPlatform>>;
let saves: SaveService;
let directory: string;
let releaseId: string;

// Independent synthetic container for HTTP transformation tests, not a playable emulator state.
function snapshot(ram = phantasyStar4Fixture()) {
  const coreSize = 0xfd000;
  const bytes = Buffer.alloc(coreSize + 40);
  bytes.write("RASTATE\x01MEM ");
  bytes.writeUInt32LE(coreSize, 12);
  bytes.write("GENPLUS-GX 1.7.6", 16);
  for (let offset = 0; offset < ram.length; offset++) bytes[32 + (offset ^ 1)] = ram[offset] ?? 0;
  bytes.fill(0xa5, 32 + ram.length, 16 + coreSize);
  bytes.write("ACHV", 16 + coreSize);
  bytes.writeUInt32LE(5, 20 + coreSize);
  bytes.set([8, 6, 7, 5, 3], 24 + coreSize);
  bytes.write("END ", 32 + coreSize);
  return bytes;
}

beforeAll(async () => {
  database = await testDatabase();
  directory = await mkdtemp(join(tmpdir(), "rebito-console-editor-"));
  const library = join(directory, "library");
  await mkdir(library);
  const bytes = mdFixture();
  const entry = {
    title: "Synthetic console editor fixture",
    system: "md" as const,
    file: "fixture.md",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    saveFiles: [],
    editor: "phantasy-star4",
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

async function original(
  bytes = snapshot(),
  metadata: Partial<SaveMetadata> = {},
  name = stateFile,
) {
  const owner = users[0]?.id ?? "";
  const profile = await saves.revisions.create(owner, releaseId, "Console editor");
  return saves.publish(
    owner,
    profile.id,
    null,
    { kind: "snapshot", releaseId, runtime, ...metadata },
    [
      { name, bytes },
      { name: "save.srm", bytes: Uint8Array.of(1, 2, 3, 4) },
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
const batch = (money: number) => ({
  file: stateFile,
  edits: [{ slot: 0, changes: { "party.money": money } }],
});
const history = (profileId: string) => saves.revisions.history(users[0]?.id ?? "", profileId);

it("previews privately and publishes only verified memory while preserving companions and identity", async () => {
  const source = snapshot();
  const initial = await original(source);
  const preview = await request(initial.id, { changes: { "party.money": 12345 } });
  expect(preview.statusCode).toBe(200);
  expect(preview.headers["cache-control"]).toBe("no-store");
  expect(preview.json()).toMatchObject({
    file: stateFile,
    files: [stateFile],
    changes: { "party.money": 12345 },
  });
  expect(await history(initial.profileId)).toHaveLength(1);
  const result = await request(initial.id, batch(12345), true);
  expect(result.statusCode).toBe(201);
  expect(result.json()).toMatchObject({
    parentId: initial.id,
    source: "editor",
    manifest: { kind: "snapshot", releaseId, runtime },
  });
  const expected = Buffer.from(source);
  const money = Buffer.alloc(4);
  money.writeUInt32BE(12345);
  for (let index = 0; index < 4; index++) expected[32 + ((0xf438 + index) ^ 1)] = money[index] ?? 0;
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
  expect(Buffer.from(await saves.file(users[0]?.id ?? "", initial.id, stateFile))).toEqual(source);
  expect(await history(initial.profileId)).toHaveLength(2);
  expect((await request(initial.id, batch(99), true)).statusCode).toBe(409);
});

it("checks ownership and origin before parsing and never accepts a client-selected memory parser", async () => {
  const initial = await original();
  expect((await request(initial.id, {}, false, 1)).statusCode).toBe(404);
  expect((await request(initial.id, batch(99), true, 1)).statusCode).toBe(404);
  const url = `/api/revisions/${initial.id}/editor/preview`;
  expect(
    (
      await app.inject({
        method: "POST",
        url,
        headers: { "content-type": "application/json" },
        payload: "invalid",
      })
    ).statusCode,
  ).toBe(401);
  for (const requestOrigin of [undefined, "https://untrusted.example"]) {
    const headers: Record<string, string> = { cookie: users[0]?.cookie ?? "" };
    if (requestOrigin) headers.origin = requestOrigin;
    expect((await app.inject({ method: "POST", url, headers, payload: {} })).statusCode).toBe(403);
  }
  for (const key of ["editor", "core", "domain", "offset", "runtime"])
    expect((await request(initial.id, { [key]: "genesis_plus_gx" })).statusCode).toBe(400);
  expect((await request(initial.id, { ...batch(99), core: "picodrive" }, true)).statusCode).toBe(
    400,
  );
  expect(await history(initial.profileId)).toHaveLength(1);
});

it("rejects wrong runtime identities, progress kinds and unexpected state files", async () => {
  for (const invalid of [
    { ...runtime, adapter: "other" },
    { ...runtime, core: "picodrive" },
    { ...runtime, version: "unreviewed-version" },
  ]) {
    const initial = await original(snapshot(), { runtime: invalid });
    expect((await request(initial.id, {})).json().error).toBe("unsupported_editor");
    expect((await request(initial.id, batch(99), true)).json().error).toBe("unsupported_editor");
    expect(await history(initial.profileId)).toHaveLength(1);
  }
  for (const kind of ["game-save", "filesystem"] as const) {
    const initial = await original(snapshot(), { kind });
    expect((await request(initial.id, {})).json().error).toBe("no_editable_save");
    expect((await request(initial.id, batch(99), true)).json().error).toBe("no_editable_save");
  }
  expect((await request((await original(snapshot(), {}, "other.bin")).id, {})).json().error).toBe(
    "no_editable_save",
  );
  const initial = await original();
  for (const file of ["save.srm", "__runtime/opaque.bin", "../__runtime/state.bin"])
    expect((await request(initial.id, { file })).json().error).toBe("no_editable_save");
});

it("rejects malformed containers or RAM and invalid edits without publishing a partial revision", async () => {
  const wrongHeader = snapshot();
  wrongHeader[16] = 0;
  for (const bytes of [snapshot().subarray(1), wrongHeader, snapshot(new Uint8Array(0x10000))]) {
    const initial = await original(bytes);
    expect((await request(initial.id, {})).json().error).toBe("invalid_save");
    expect((await request(initial.id, batch(99), true)).json().error).toBe("invalid_save");
    expect(await history(initial.profileId)).toHaveLength(1);
  }
  const initial = await original();
  for (const payload of [
    batch(-1),
    { file: stateFile, edits: [{ slot: 1, changes: { "party.money": 99 } }] },
    {
      file: stateFile,
      edits: [{ slot: 0, changes: { "party.money": 99, "person.0.maxHealth": 0 } }],
    },
    { files: [batch(99), { file: "save.srm", edits: batch(99).edits }] },
  ]) {
    expect((await request(initial.id, payload, true)).statusCode).toBe(422);
    expect(await history(initial.profileId)).toHaveLength(1);
  }
  expect(Buffer.from(await saves.file(users[0]?.id ?? "", initial.id, stateFile))).toEqual(
    snapshot(),
  );
});

it("admits exactly one competing snapshot edit without rebasing or losing the winner", async () => {
  const initial = await original();
  const results = await Promise.all([
    request(initial.id, batch(123), true),
    request(initial.id, batch(456), true),
  ]);
  expect(results.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409]);
  const winner = results.find(({ statusCode }) => statusCode === 201);
  const preview = await request(winner?.json().id, { module: "party" });
  expect(preview.statusCode).toBe(200);
  const money = preview.json().fields.find((field: { key: string }) => field.key === "party.money");
  expect([123, 456]).toContain(money?.value);
  expect(await history(initial.profileId)).toHaveLength(2);
});

it("rechecks an administrator's removed association before publishing an already-open editor", async () => {
  const initial = await original();
  expect((await request(initial.id, {})).statusCode).toBe(200);
  const library = join(directory, "library");
  const current = await withCatalog(library, async (catalog) => findEntry(catalog, releaseId));
  await changeConfiguration(
    library,
    releaseId,
    { token: entryToken(current), title: current.title, editor: null },
    1e9,
    0,
  );
  try {
    expect((await request(initial.id, {})).json().error).toBe("unsupported_editor");
    expect((await request(initial.id, batch(99), true)).json().error).toBe("unsupported_editor");
    expect(await history(initial.profileId)).toHaveLength(1);
  } finally {
    await withCatalog(library, async (catalog) => {
      findEntry(catalog, releaseId).editor = "phantasy-star4";
      await writeCatalog(library, catalog);
    });
  }
});
