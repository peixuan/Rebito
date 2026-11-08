import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync, zipSync } from "fflate";
import { afterAll, beforeAll, expect, it } from "vitest";
import { loadConfig } from "../../src/server/config.ts";
import { createPlatform } from "../../src/server/platform.ts";
import { testDatabase } from "../database.ts";

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: Awaited<ReturnType<typeof createPlatform>>;
let directory: string;
let admin = "";
let player = "";
const adminUserIds: string[] = [];
const origin = "http://localhost:3000";
const config = {
  ...loadConfig({
    APP_ORIGIN: origin,
    DATABASE_URL: "postgresql://unused/unused",
    AUTH_SECRET: randomBytes(32).toString("hex"),
    ALLOW_REGISTRATION: "true",
  }),
  adminUserIds,
};
const settings = {
  title: "Uploaded DOS",
  system: "dos",
  executable: "PLAY.BAT",
  saveFiles: ["SAVE.DAT", "slots/index.dat"],
};
const bundle = zipSync({
  "PLAY.BAT": Buffer.from("echo READY"),
  "SAVE.DAT": Buffer.from("private"),
  "RESOURCE.BIN": Uint8Array.of(1, 255),
});

beforeAll(async () => {
  fixture = await testDatabase();
  directory = await mkdtemp(join(tmpdir(), "game-admin-api-"));
  config.dataDirectory = directory;
  app = await createPlatform(config, fixture.database);
  for (const name of ["admin", "player"]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin },
      payload: {
        email: `${name}@example.test`,
        name,
        password: "library-test-password-123",
        admin: true,
      },
    });
    expect(response.statusCode).toBe(200);
    const cookie = response.cookies.map((entry) => `${entry.name}=${entry.value}`).join("; ");
    if (name === "admin") {
      admin = cookie;
      adminUserIds.push(response.json().user.id);
    } else player = cookie;
  }
}, 30_000);
afterAll(async () => {
  await app?.close();
  await fixture?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function upload(
  options: {
    metadata?: unknown;
    bytes?: Uint8Array;
    filename?: string;
    cookie?: string;
    site?: string;
    target?: typeof app;
    fileFirst?: boolean;
  } = {},
) {
  const form = new FormData();
  const file = new Blob([Buffer.from(options.bytes ?? bundle)]);
  if (options.fileFirst) form.append("file", file, "game.zip");
  form.append("metadata", JSON.stringify(options.metadata ?? settings));
  if (!options.fileFirst) form.append("file", file, options.filename ?? "game.zip");
  const request = new Request(origin, { method: "POST", body: form });
  return (options.target ?? app).inject({
    method: "POST",
    url: "/api/admin/games",
    headers: {
      origin: options.site ?? origin,
      cookie: options.cookie ?? admin,
      "content-type": request.headers.get("content-type") ?? "",
    },
    payload: Buffer.from(await request.arrayBuffer()),
  });
}

it("requires an authenticated administrator and same-origin mutation before accepting uploads", async () => {
  expect((await app.inject("/api/admin/games")).statusCode).toBe(401);
  expect(
    (await app.inject({ url: "/api/admin/games", headers: { cookie: player } })).statusCode,
  ).toBe(403);
  expect((await upload({ cookie: "" })).statusCode).toBe(401);
  expect((await upload({ cookie: player })).statusCode).toBe(403);
  expect((await upload({ site: "https://elsewhere.test" })).statusCode).toBe(403);
  expect((await readdir(directory)).includes("library")).toBe(false);
});

it("publishes sanitized DOS bytes immediately, reloads other instances and rejects duplicate versions", async () => {
  const second = await createPlatform(config, fixture.database);
  try {
    const response = await upload();
    expect(response.statusCode).toBe(201);
    const { game, removed } = response.json();
    expect(removed).toEqual(["SAVE.DAT"]);
    expect(game.saveFiles).toEqual(settings.saveFiles);
    expect(game).not.toHaveProperty("editor");
    const games = await second.inject({ url: "/api/games", headers: { cookie: player } });
    expect(games.json().map((entry: { id: string }) => entry.id)).toContain(game.id);
    const asset = await second.inject({
      url: `/api/games/${game.id}/asset`,
      headers: { cookie: player },
    });
    const files = unzipSync(asset.rawPayload);
    expect(files["SAVE.DAT"]).toBeUndefined();
    expect(files["RESOURCE.BIN"]).toEqual(Uint8Array.of(1, 255));
    expect(new TextDecoder().decode(files[".jsdos/dosbox.conf"])).toContain("PLAY.BAT");
    expect((await upload()).statusCode).toBe(409);
    const changed = await upload({ metadata: { ...settings, saveFiles: ["SAVE.DAT"] } });
    expect(changed.statusCode).toBe(201);
    expect(changed.json().game.id).not.toBe(game.id);
    expect(await readdir(join(directory, "library", ".uploads"))).toEqual([]);
  } finally {
    await second.close();
  }
});

it("rejects malformed settings, bad archive data, wrong formats and oversized input", async () => {
  for (const options of [
    { metadata: { ...settings, editor: "koukai2" } },
    { bytes: Uint8Array.of(1) },
    { filename: "game.exe" },
    { fileFirst: true },
    {
      metadata: { title: "Invalid ROM", system: "nes" },
      filename: "game.nes",
      bytes: Uint8Array.of(1),
    },
    { metadata: { title: "Wrong extension", system: "gba" }, filename: "game.zip" },
  ])
    expect((await upload(options)).statusCode).toBe(422);
  expect((await upload({ bytes: new Uint8Array(64 * 1024 ** 2 + 1) })).statusCode).toBe(413);
  expect(await readdir(join(directory, "library", ".uploads"))).toEqual([]);
});

it("streams console bytes unchanged and admits only one concurrent import", async () => {
  const rom = Buffer.alloc(32784);
  rom.set([0x4e, 0x45, 0x53, 0x1a, 1]);
  const request = {
    metadata: { title: "NES fixture", system: "nes" },
    filename: "fixture.nes",
    bytes: rom,
  };
  const responses = await Promise.all([upload(request), upload(request)]);
  expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 503]);
  const published = responses.find((response) => response.statusCode === 201)?.json();
  const asset = await app.inject({
    url: `/api/games/${published.game.id}/asset`,
    headers: { cookie: player },
  });
  expect(asset.rawPayload).toEqual(rom);
});

it("preserves the catalog and cleans staging after quota or disk-reserve rejection", async () => {
  const before = (await app.inject({ url: "/api/games", headers: { cookie: player } })).json();
  for (const change of [
    { maximumLibraryBytes: 1 },
    { minimumFreeBytes: Number.MAX_SAFE_INTEGER },
  ]) {
    const limited = await createPlatform({ ...config, ...change }, fixture.database);
    try {
      expect((await upload({ target: limited })).statusCode).toBe(507);
    } finally {
      await limited.close();
    }
  }
  expect((await app.inject({ url: "/api/games", headers: { cookie: player } })).json()).toEqual(
    before,
  );
  expect(await readdir(join(directory, "library", ".uploads"))).toEqual([]);
});

it("cleans a real interrupted HTTP upload and permits the next publication", async () => {
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const request = httpRequest(`${address}/api/admin/games`, {
    method: "POST",
    headers: { cookie: admin, origin, "content-type": "multipart/form-data; boundary=interrupted" },
  });
  request.on("error", () => {}); // Intentional client disconnect below.
  try {
    request.write(
      `--interrupted\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(settings)}\r\n--interrupted\r\nContent-Disposition: form-data; name="file"; filename="game.zip"\r\nContent-Type: application/zip\r\n\r\npartial`,
    );
    const staging = join(directory, "library", ".uploads");
    await expect.poll(() => readdir(staging)).toHaveLength(1);
    request.destroy();
    await expect.poll(() => readdir(staging)).toHaveLength(0);
    expect((await upload({ metadata: { ...settings, cycles: "4000" } })).statusCode).toBe(201);
  } finally {
    request.destroy();
  }
});
