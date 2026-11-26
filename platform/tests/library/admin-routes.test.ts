import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync, zipSync } from "fflate";
import { afterAll, beforeAll, expect, it } from "vitest";
import { findEntry } from "../../src/library/configuration.ts";
import { beginDeletion, deletionImpact } from "../../src/library/deletion-records.ts";
import { withCatalog } from "../../src/library/transaction.ts";
import { loadConfig } from "../../src/server/config.ts";
import { createPlatform } from "../../src/server/platform.ts";
import { message } from "../../src/shared/messages.ts";
import { testDatabase } from "../database.ts";
import { mdFixture, sega8Fixture, smdFixture } from "./sega-fixtures.ts";
import { discArchive, discBios, discCue, discTrack } from "./segacd-fixtures.ts";

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
  const catalog = await app.inject({ url: "/api/admin/games", headers: { cookie: admin } });
  expect(catalog.statusCode).toBe(200);
  expect(catalog.json().editors).toEqual([
    expect.objectContaining({ id: "koukai2", label: message("editor.koukaiTitle"), system: "dos" }),
    expect.objectContaining({
      id: "jinyong",
      label: message("editor.jinyongTitle"),
      system: "dos",
    }),
    expect.objectContaining({
      id: "phantasy-star4",
      label: message("editor.phantasyStar4Title"),
      system: "md",
    }),
    expect.objectContaining({ id: "san3", label: message("editor.san3Title"), system: "segacd" }),
    expect.objectContaining({
      id: "eiketsuden",
      label: message("editor.eiketsudenTitle"),
      system: "dos",
    }),
  ]);
});

it("protects regional firmware uploads and rejects stale or malformed requests", async () => {
  for (const [cookie, status] of [
    ["", 401],
    [player, 403],
  ] as const) {
    expect((await app.inject({ url: "/api/admin/firmware", headers: { cookie } })).statusCode).toBe(
      status,
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/admin/firmware",
          headers: { cookie, origin, "content-type": "application/json" },
          payload: "{",
        })
      ).statusCode,
    ).toBe(status);
  }
  const current = (
    await app.inject({ url: "/api/admin/firmware", headers: { cookie: admin } })
  ).json();
  const payload = {
    token: current.token,
    firmware: discBios("E").toString("base64"),
    allowUnrecognized: true,
  };
  const send = (body: unknown, site = origin) =>
    app.inject({
      method: "POST",
      url: "/api/admin/firmware",
      headers: { cookie: admin, origin: site },
      payload: body as object,
    });
  expect((await send(payload, "https://elsewhere.test")).statusCode).toBe(403);
  expect((await send({ ...payload, allowUnrecognized: false })).statusCode).toBe(422);
  expect((await send({ ...payload, firmware: "bad" })).statusCode).toBe(422);
  expect((await send({ ...payload, firmware: "x".repeat(180000) })).statusCode).toBe(413);
  const saved = await send(payload);
  expect(saved.statusCode).toBe(200);
  expect(saved.json().entries).toContainEqual(
    expect.objectContaining({
      region: "E",
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      recognized: false,
    }),
  );
  expect((await send(payload)).statusCode).toBe(409);
});

it("publishes sanitized DOS bytes immediately, reloads other instances and rejects duplicate versions", async () => {
  const second = await createPlatform(config, fixture.database);
  try {
    const response = await upload({ metadata: { ...settings, editor: "koukai2" } });
    expect(response.statusCode).toBe(201);
    const { game, removed } = response.json();
    expect(removed).toEqual(["SAVE.DAT"]);
    expect(game.saveFiles).toEqual(settings.saveFiles);
    expect(game.editor).toBe("koukai2");
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
    expect(changed.json().game).not.toHaveProperty("editor");
    expect(changed.json().game.id).not.toBe(game.id);
    expect(await readdir(join(directory, "library", ".uploads"))).toEqual([]);
  } finally {
    await second.close();
  }
});

it("rejects malformed settings, bad archive data, wrong formats and oversized input", async () => {
  for (const options of [
    { metadata: { ...settings, editor: "unknown" } },
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

it("requires matching BIOS, publishes a private CD package and cleans failed uploads", async () => {
  const metadata = {
    title: "Mega CD fixture",
    system: "segacd",
    firmware: discBios().toString("base64"),
    allowUnrecognizedFirmware: true,
  };
  expect((await upload({ metadata, bytes: discArchive(), cookie: player })).statusCode).toBe(403);
  expect(
    (
      await upload({
        metadata: { ...metadata, allowUnrecognizedFirmware: false },
        bytes: discArchive(),
      })
    ).statusCode,
  ).toBe(422);
  expect(
    (await upload({ metadata: { ...metadata, firmware: undefined }, bytes: discArchive() }))
      .statusCode,
  ).toBe(422);
  expect(
    (
      await upload({
        metadata: { ...metadata, firmware: discBios("U").toString("base64") },
        bytes: discArchive(),
      })
    ).statusCode,
  ).toBe(422);
  const response = await upload({ metadata, bytes: discArchive() });
  expect(response.statusCode).toBe(201);
  const { game } = response.json();
  expect(game.system).toBe("segacd");
  expect(game).not.toHaveProperty("firmware");
  expect((await app.inject(`/api/games/${game.id}/asset`)).statusCode).toBe(401);
  const asset = await app.inject({
    url: `/api/games/${game.id}/asset`,
    headers: { cookie: player },
  });
  expect(Object.keys(unzipSync(asset.rawPayload))).toEqual([
    "disc.cue",
    "track-01.bin",
    "bios_CD_J.bin",
  ]);
  expect((await upload({ metadata, bytes: discArchive() })).statusCode).toBe(409);
  expect(await readdir(join(directory, "library", ".uploads"))).toEqual([]);
});

it("reuses the detected regional BIOS across distinct discs without another firmware upload", async () => {
  for (const marker of [17, 18]) {
    const track = discTrack("E");
    track[0x1000] = marker;
    const response = await upload({
      metadata: { title: `Automatic firmware ${marker}`, system: "segacd" },
      bytes: discArchive(discCue, { "game.bin": track }),
    });
    expect(response.statusCode).toBe(201);
    const asset = await app.inject({
      url: `/api/games/${response.json().game.id}/asset`,
      headers: { cookie: player },
    });
    const files = unzipSync(asset.rawPayload);
    expect(files["bios_CD_E.bin"]).toEqual(new Uint8Array(discBios("E")));
    expect(files["track-01.bin"]).toEqual(new Uint8Array(track));
  }
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

it("authorizes configuration changes and preserves a renamed release without uploads", async () => {
  const games = (await app.inject({ url: "/api/admin/games", headers: { cookie: admin } })).json()
    .games;
  const path = `/api/admin/games/${games[0].id}/configuration`;
  expect((await app.inject({ url: path, headers: { cookie: player } })).statusCode).toBe(403);
  const detail = (await app.inject({ url: path, headers: { cookie: admin } })).json();
  const payload = { token: detail.token, title: "Updated without upload" };
  expect(
    (
      await app.inject({
        method: "POST",
        url: path,
        headers: { cookie: admin, origin: "https://other.test" },
        payload,
      })
    ).statusCode,
  ).toBe(403);
  const response = await app.inject({
    method: "POST",
    url: path,
    headers: { cookie: admin, origin },
    payload,
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    created: false,
    game: { id: games[0].id, title: payload.title },
  });
});

it("previews all users, requires explicit consent, rejects stale impact and removes only that game", async () => {
  const games = (await app.inject({ url: "/api/games", headers: { cookie: admin } })).json();
  const game = games[0];
  const url = `/api/admin/games/${game.id}/deletion`;
  const profiles: string[] = [];
  for (const cookie of [admin, player]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/profiles",
      headers: { cookie, origin },
      payload: { releaseId: game.id, name: "Affected" },
    });
    expect(response.statusCode).toBe(201);
    profiles.push(response.json().id);
  }
  expect((await app.inject({ url, headers: { cookie: player } })).statusCode).toBe(403);
  const preview = (await app.inject({ url, headers: { cookie: admin } })).json();
  expect(preview).toMatchObject({ users: 2, profiles: 2, revisions: 0 });
  const payload = { token: preview.token, title: preview.title, deleteSaves: true };
  const remove = (body = payload, cookie = admin, site = origin) =>
    app.inject({ method: "POST", url, headers: { cookie, origin: site }, payload: body });
  expect((await remove(payload, player)).statusCode).toBe(403);
  expect((await remove(payload, admin, "https://other.test")).statusCode).toBe(403);
  expect((await remove({ ...payload, deleteSaves: false })).statusCode).toBe(422);
  await app.inject({
    method: "POST",
    url: "/api/profiles",
    headers: { cookie: player, origin },
    payload: { releaseId: game.id, name: "After preview" },
  });
  expect((await remove()).statusCode).toBe(409);
  const current = (await app.inject({ url, headers: { cookie: admin } })).json();
  const removed = await remove({ ...payload, token: current.token });
  expect(removed.statusCode).toBe(200);
  expect(removed.json()).toMatchObject({
    status: "deleted",
    profiles: 3,
    reclaimedBytes: game.size,
  });
  expect(
    (await app.inject({ url: `/api/games/${game.id}/asset`, headers: { cookie: player } }))
      .statusCode,
  ).toBe(404);
  expect(
    (
      await app.inject({
        url: `/api/profiles/${profiles[1]}/revisions`,
        headers: { cookie: player },
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/profiles",
        headers: { cookie: player, origin },
        payload: { releaseId: game.id, name: "Stale browser" },
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (await app.inject({ url: "/api/games", headers: { cookie: player } })).json(),
  ).toHaveLength(games.length - 1);
});

it("retains failed cleanup across restart, blocks reuse and permits an explicit retry", async () => {
  const game = (await app.inject({ url: "/api/games", headers: { cookie: admin } })).json()[0];
  const job = await withCatalog(join(directory, "library"), async (catalog) => {
    const entry = findEntry(catalog, game.id);
    const { preview } = await deletionImpact(fixture.database, catalog, entry);
    return beginDeletion(fixture.database, catalog, entry, {
      token: preview.token,
      title: preview.title,
      deleteSaves: true,
    });
  });
  const lock = join(directory, "library", ".import.lock");
  await writeFile(lock, "simulated interrupted publisher");
  const restarted = await createPlatform(config, fixture.database);
  try {
    expect(
      (await restarted.inject({ url: "/api/games", headers: { cookie: player } }))
        .json()
        .some((entry: { id: string }) => entry.id === game.id),
    ).toBe(false);
    const pending = (
      await restarted.inject({ url: "/api/admin/deletions", headers: { cookie: admin } })
    ).json();
    expect(pending).toHaveLength(1);
    expect((await upload({ target: restarted })).statusCode).toBe(409);
    const request = {
      method: "POST" as const,
      url: `/api/admin/games/${game.id}/deletion`,
      headers: { cookie: admin, origin },
      payload: { token: job.preview.token, title: job.preview.title, deleteSaves: true },
    };
    expect((await restarted.inject(request)).statusCode).toBe(202);
    await rm(lock);
    expect((await restarted.inject(request)).json().status).toBe("deleted");
    expect(
      (await restarted.inject({ url: "/api/admin/deletions", headers: { cookie: admin } })).json(),
    ).toEqual([]);
  } finally {
    await restarted.close();
    await rm(lock, { force: true });
  }
});

it.each([
  ["md", ".md", mdFixture],
  ["md", ".smd", smdFixture],
  ["sms", ".sms", () => sega8Fixture()],
  ["gg", ".gg", () => sega8Fixture(true)],
] as const)(
  "publishes %s %s without changing cartridge bytes",
  async (system, extension, fixture) => {
    const bytes = fixture();
    const response = await upload({
      metadata: { title: `Sega ${extension}`, system },
      filename: `cartridge${extension}`,
      bytes,
    });
    expect(response.statusCode).toBe(201);
    const game = response.json().game;
    expect(game.system).toBe(system);
    expect(game.editor).toBeUndefined();
    const asset = await app.inject({
      url: `/api/games/${game.id}/asset`,
      headers: { cookie: player },
    });
    expect(asset.rawPayload).toEqual(Buffer.from(bytes));
  },
);

it("rejects Sega model/header mismatches before publishing and cleans staged files", async () => {
  const before = await readdir(join(directory, "library"));
  for (const [system, filename, bytes] of [
    ["md", "game.md", sega8Fixture()],
    ["sms", "game.sms", sega8Fixture(true)],
    ["gg", "game.gg", sega8Fixture()],
    ["md", "game.iso", mdFixture()],
  ] as const)
    expect(
      (await upload({ metadata: { title: "Mismatch", system }, filename, bytes })).statusCode,
    ).toBe(422);
  expect(await readdir(join(directory, "library"))).toEqual(before);
  expect(await readdir(join(directory, "library", ".uploads"))).toEqual([]);
});

it("limits quota configuration to administrators and rejects stale or partial updates", async () => {
  const url = "/api/admin/save-quotas";
  const get = (cookie: string) => app.inject({ url, headers: { cookie } });
  expect((await get("")).statusCode).toBe(401);
  expect((await get(player)).statusCode).toBe(403);
  const initial = (await get(admin)).json().settings;
  const save = (payload: object, cookie = admin, site = origin) =>
    app.inject({
      method: "POST",
      url,
      headers: { origin: site, cookie },
      payload,
    });
  expect((await save(initial, player)).statusCode).toBe(403);
  expect((await save(initial, admin, "https://example.invalid")).statusCode).toBe(403);
  expect((await save({ ...initial, account: {} })).statusCode).toBe(400);
  expect((await save({ ...initial, site: { bytes: 0, revisions: 10 } })).statusCode).toBe(400);
  const changed = {
    ...initial,
    account: { ...initial.account, profiles: 43 },
    site: { bytes: 123456, revisions: 55 },
  };
  const response = await save(changed);
  expect(response.statusCode).toBe(200);
  expect(response.json().settings).toEqual({ ...changed, version: initial.version + 1 });
  expect((await save(initial)).statusCode).toBe(409);
  const usage = await app.inject({ url: "/api/storage", headers: { cookie: player } });
  expect(usage.json().limits.profiles).toBe(43);
  expect((await save({ ...initial, version: response.json().settings.version })).statusCode).toBe(
    200,
  );
});
