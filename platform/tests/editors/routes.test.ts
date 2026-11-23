import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { changeConfiguration, entryToken, findEntry } from "../../src/library/configuration.ts";
import { withCatalog, writeCatalog } from "../../src/library/transaction.ts";
import { SaveService } from "../../src/saves/service.ts";
import { loadConfig } from "../../src/server/config.ts";
import { createPlatform } from "../../src/server/platform.ts";
import { LocalBlobStore } from "../../src/storage/blobs.ts";
import { RevisionRepository } from "../../src/storage/revisions.ts";
import { testDatabase } from "../database.ts";
import { editorFixture } from "./fixture.ts";
import { seedEditor } from "./library-fixture.ts";

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: Awaited<ReturnType<typeof createPlatform>>;
let saves: SaveService;
let directory: string;
let releaseId: string;
const users: { id: string; cookie: string }[] = [];
const origin = "http://localhost:3000";
beforeAll(async () => {
  fixture = await testDatabase();
  directory = await mkdtemp(join(tmpdir(), "retro-editor-"));
  releaseId = await seedEditor(directory);
  app = await createPlatform(
    loadConfig({
      APP_ORIGIN: origin,
      DATABASE_URL: "postgresql://unused/unused",
      AUTH_SECRET: randomBytes(32).toString("hex"),
      DATA_DIR: directory,
      ALLOW_REGISTRATION: "true",
    }),
    fixture.database,
  );
  saves = new SaveService(
    new RevisionRepository(fixture.database),
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
      cookie: response.cookies.map((value) => `${value.name}=${value.value}`).join("; "),
    });
  }
}, 30_000);
afterAll(async () => {
  await app?.close();
  await fixture?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function original(bytes = editorFixture(), release = releaseId, name = "KOUKAI2.DAT") {
  const owner = users[0]?.id ?? "";
  const profile = await saves.revisions.create(owner, release, "Editor");
  return saves.publish(
    owner,
    profile.id,
    null,
    { kind: "filesystem", releaseId: release },
    [
      { name, bytes },
      { name: "__runtime/filesystem.zip", bytes: Uint8Array.of(1, 2) },
    ],
    "game",
  );
}
function request(id: string, body: unknown, publish = false, user = 0) {
  return app.inject({
    method: "POST",
    url: `/api/revisions/${id}/editor${publish ? "" : "/preview"}`,
    headers: { origin, cookie: users[user]?.cookie ?? "" },
    payload: body as object,
  });
}
const batch = (money: number) => ({
  file: "KOUKAI2.DAT",
  edits: [{ slot: 0, changes: { money } }],
});
it("rejects an open editor after another instance removes its game association", async () => {
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
    expect((await request(initial.id, batch(9), true)).json().error).toBe("unsupported_editor");
    expect(await saves.revisions.history(users[0]?.id ?? "", initial.profileId)).toHaveLength(1);
  } finally {
    // Restore the trusted synthetic fixture for the remaining independent API cases.
    await withCatalog(library, async (catalog) => {
      findEntry(catalog, releaseId).editor = "koukai2";
      await writeCatalog(library, catalog);
    });
  }
});
it("previews without writing and atomically publishes several slots as a new private revision", async () => {
  const bytes = editorFixture();
  bytes.set(new TextEncoder().encode("11/ 11/1522"), 1 + 9 * 15);
  bytes[0x97 + 9 * 0x8074 + 0x611] = 5;
  const initial = await original(bytes);
  const preview = await request(initial.id, { changes: { money: 123 } });
  expect(preview.statusCode).toBe(200);
  expect(preview.json()).toMatchObject({
    file: "KOUKAI2.DAT",
    files: ["KOUKAI2.DAT"],
    changes: { money: 123 },
  });
  expect(preview.headers["cache-control"]).toBe("no-store");
  expect(await saves.revisions.history(users[0]?.id ?? "", initial.profileId)).toHaveLength(1);
  const body = batch(123);
  body.edits.push({ slot: 9, changes: { money: 456 } });
  const result = await request(initial.id, body, true);
  expect(result.statusCode).toBe(201);
  expect(result.json()).toMatchObject({ source: "editor", parentId: initial.id });
  const expected = new Uint8Array(bytes);
  expected.set([123, 0, 0, 0], 0x6a1);
  expected.set([200, 1, 0, 0], 0x6a1 + 9 * 0x8074);
  expect(
    Buffer.from(await saves.file(users[0]?.id ?? "", result.json().id, "KOUKAI2.DAT")),
  ).toEqual(Buffer.from(expected));
  expect(result.json().manifest.artifacts[1]).toEqual(initial.manifest.artifacts[1]);
  expect((await request(initial.id, batch(10), true)).statusCode).toBe(409);
  expect((await request(initial.id, {}, false, 1)).statusCode).toBe(404);
  expect((await request(initial.id, batch(10), true, 1)).statusCode).toBe(404);
});
it("authenticates before parsing and rejects missing CSRF origins or untrusted shapes", async () => {
  const initial = await original();
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/revisions/${initial.id}/editor/preview`,
        headers: { "content-type": "application/json" },
        payload: "invalid",
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/revisions/${initial.id}/editor/preview`,
        headers: { cookie: users[0]?.cookie ?? "" },
        payload: {},
      })
    ).statusCode,
  ).toBe(403);
  for (const body of [
    { offset: 0 },
    { changes: { money: 0.5 } },
    { slot: 10 },
    { changes: { money: "1" } },
  ])
    expect((await request(initial.id, body)).statusCode).toBe(400);
  expect((await request(initial.id, { file: "KOUKAI2.DAT", edits: [] }, true)).statusCode).toBe(
    400,
  );
  expect(
    (
      await request(
        initial.id,
        { file: "KOUKAI2.DAT", edits: [batch(1).edits[0], batch(2).edits[0]] },
        true,
      )
    ).statusCode,
  ).toBe(400);
  expect((await request(initial.id, { changes: { money: -1 } })).json().error).toBe("invalid_edit");
});
it("rejects unsupported releases, unexpected files and malformed saves", async () => {
  expect(
    (await request((await original(editorFixture(), "unconfigured")).id, {})).json().error,
  ).toBe("unsupported_editor");
  expect(
    (await request((await original(editorFixture(), releaseId, "OTHER.DAT")).id, {})).json().error,
  ).toBe("no_editable_save");
  expect((await request((await original(new Uint8Array(328991))).id, {})).json().error).toBe(
    "invalid_save",
  );
  const initial = await original();
  expect((await request(initial.id, { file: "../KOUKAI2.DAT" })).json().error).toBe(
    "no_editable_save",
  );
  const body = batch(123);
  body.edits.push({ slot: 1, changes: { money: 10 } });
  expect((await request(initial.id, body, true)).statusCode).toBe(422);
  expect(await saves.revisions.history(users[0]?.id ?? "", initial.profileId)).toHaveLength(1);
});
it("allows only one concurrent editor to advance a revision", async () => {
  const initial = await original();
  const results = await Promise.all([
    request(initial.id, batch(1), true),
    request(initial.id, batch(2), true),
  ]);
  expect(results.map((response) => response.statusCode).sort()).toEqual([201, 409]);
});

it("bounds text drafts and rejects text unsupported by the selected adapter atomically", async () => {
  const initial = await original();
  for (const textChanges of [
    { name: 42 },
    { name: "a".repeat(129) },
    Object.fromEntries(Array.from({ length: 257 }, (_, index) => [String(index), "a"])),
  ]) {
    expect((await request(initial.id, { textChanges })).statusCode).toBe(400);
    expect(
      (
        await request(
          initial.id,
          {
            file: "KOUKAI2.DAT",
            edits: [{ slot: 0, changes: { money: 123 }, textChanges }],
          },
          true,
        )
      ).statusCode,
    ).toBe(400);
  }
  const textChanges = { name: "new name" };
  expect((await request(initial.id, { textChanges })).json().error).toBe("invalid_edit");
  expect(
    (
      await request(
        initial.id,
        {
          file: "KOUKAI2.DAT",
          edits: [{ slot: 0, changes: { money: 123 }, textChanges }],
        },
        true,
      )
    ).json().error,
  ).toBe("invalid_edit");
  expect((await request(initial.id, { textChanges }, false, 1)).statusCode).toBe(404);
  expect(await saves.revisions.history(users[0]?.id ?? "", initial.profileId)).toHaveLength(1);
  expect((await request(initial.id, { textChanges: {} })).statusCode).toBe(200);
});

it("publishes multiple editable files once and rejects an invalid later file atomically", async () => {
  const owner = users[0]?.id ?? "";
  const profile = await saves.revisions.create(owner, releaseId, "Grouped edits");
  const initial = await saves.publish(
    owner,
    profile.id,
    null,
    { kind: "game-save", releaseId },
    ["KOUKAI2.DAT", "SECOND.DAT"].map((name) => ({ name, bytes: editorFixture() })),
    "game",
  );
  const group = { files: [batch(123), { ...batch(-1), file: "SECOND.DAT" }] };
  expect((await request(initial.id, group, true)).statusCode).toBe(422);
  expect(await saves.revisions.history(owner, profile.id)).toHaveLength(1);
  expect((await request(initial.id, { files: [batch(1), batch(2)] }, true)).statusCode).toBe(400);
  expect((await request(initial.id, { files: [] }, true)).statusCode).toBe(400);
  group.files[1] = { ...batch(456), file: "SECOND.DAT" };
  const result = await request(initial.id, group, true);
  expect(result.statusCode).toBe(201);
  expect(await saves.revisions.history(owner, profile.id)).toHaveLength(2);
  for (const [name, money] of [
    ["KOUKAI2.DAT", 123],
    ["SECOND.DAT", 456],
  ] as const) {
    const expected = Buffer.from(editorFixture());
    expected.writeUInt32LE(money, 0x6a1);
    expect(Buffer.from(await saves.file(owner, result.json().id, name))).toEqual(expected);
  }
});
