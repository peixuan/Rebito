import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/server/config.ts";
import { createPlatform } from "../../src/server/platform.ts";
import { testDatabase } from "../database.ts";
import { seedLibrary } from "../library/fixture.ts";

describe("authenticated save HTTP API", () => {
  let fixture: Awaited<ReturnType<typeof testDatabase>>;
  let app: Awaited<ReturnType<typeof createPlatform>>;
  let directory: string;
  let alice: string;
  let bob: string;
  let game: Awaited<ReturnType<typeof seedLibrary>>;
  const origin = "http://localhost:3000";
  const metadata = { kind: "game-save", releaseId: "test-game", baseRevision: null };
  beforeAll(async () => {
    fixture = await testDatabase();
    directory = await mkdtemp(join(tmpdir(), "retro-api-"));
    game = await seedLibrary(directory);
    metadata.releaseId = game.id;
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
    const cookies = [];
    for (const name of ["alice", "bob"]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/sign-up/email",
        headers: { origin },
        payload: { email: `${name}@example.test`, name, password: "integration-password-123" },
      });
      expect(response.statusCode).toBe(200);
      cookies.push(response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "));
    }
    alice = cookies[0] ?? "";
    bob = cookies[1] ?? "";
  }, 30_000);
  afterAll(async () => {
    await app?.close();
    await fixture?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  async function profile() {
    const response = await app.inject({
      method: "POST",
      url: "/api/profiles",
      headers: { origin, cookie: alice },
      payload: { releaseId: metadata.releaseId, name: "Test", ownerId: "bob" },
    });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  }

  it("serves verified catalog assets only to signed-in users without exposing disk paths", async () => {
    expect((await app.inject("/api/games")).statusCode).toBe(401);
    expect((await app.inject(`/api/games/${game.id}/asset`)).statusCode).toBe(401);
    const list = await app.inject({ url: "/api/games", headers: { cookie: alice } });
    expect(list.json()).toMatchObject([{ id: game.id, title: "Test game" }]);
    expect(list.json()[0]).not.toHaveProperty("file");
    const asset = await app.inject({
      url: `/api/games/${game.id}/asset`,
      headers: { cookie: bob },
    });
    expect(asset.rawPayload).toEqual(game.bytes);
    expect(asset.headers["cache-control"]).toBe("no-store");
    expect(
      (await app.inject({ url: "/api/games/unknown/asset", headers: { cookie: alice } }))
        .statusCode,
    ).toBe(404);
  });
  async function upload(
    id: string,
    value: unknown = metadata,
    names = ["SAVE.DAT"],
    cookie = alice,
  ) {
    const body = new FormData();
    if (value !== undefined)
      body.append("metadata", typeof value === "string" ? value : JSON.stringify(value));
    for (const name of names) body.append("file", new Blob([Uint8Array.of(1, 2, 255)]), name);
    const request = new Request(origin, { method: "POST", body });
    return app.inject({
      method: "POST",
      url: `/api/profiles/${id}/revisions`,
      headers: { origin, cookie, "content-type": request.headers.get("content-type") ?? "" },
      payload: Buffer.from(await request.arrayBuffer()),
    });
  }

  it("keeps uploads, downloads, history and restores private and revision checked", async () => {
    expect((await app.inject("/health/ready")).statusCode).toBe(200);
    const id = await profile();
    expect((await app.inject({ url: "/api/profiles", headers: { cookie: bob } })).json()).toEqual(
      [],
    );
    expect((await upload(id, metadata, ["SAVE.DAT"], bob)).statusCode).toBe(404);
    const first = await upload(id, metadata, ["nested/SAVE.DAT"]);
    expect(first.statusCode).toBe(201);
    expect((await app.inject("/api/storage")).statusCode).toBe(401);
    const usage = await app.inject({ url: "/api/storage", headers: { cookie: alice } });
    expect(usage.json().used).toEqual({ profiles: 1, revisions: 1, bytes: 3 });
    expect(usage.json().limits.bytes).toBe(2147483648);
    expect(usage.headers["cache-control"]).toBe("no-store");
    expect(
      (await app.inject({ url: "/api/storage", headers: { cookie: bob } })).json().used,
    ).toEqual({ profiles: 0, revisions: 0, bytes: 0 });
    expect(first.json().manifest).not.toHaveProperty("baseRevision");
    const revisionId = first.json().id;
    const downloaded = await app.inject({
      url: `/api/revisions/${revisionId}/file?name=nested%2FSAVE.DAT`,
      headers: { cookie: alice },
    });
    expect(downloaded.rawPayload).toEqual(Buffer.from([1, 2, 255]));
    expect(downloaded.headers["content-disposition"]).toBe("attachment");
    expect(
      (
        await app.inject({
          url: `/api/revisions/${revisionId}/file?name=nested%2FSAVE.DAT`,
          headers: { cookie: bob },
        })
      ).statusCode,
    ).toBe(404);
    expect((await upload(id)).statusCode).toBe(409);
    expect(
      (await upload(id, { ...metadata, baseRevision: revisionId, releaseId: "wrong-game" }))
        .statusCode,
    ).toBe(400);
    const restored = await app.inject({
      method: "POST",
      url: `/api/profiles/${id}/restore`,
      headers: { origin, cookie: alice },
      payload: { baseRevision: revisionId, revisionId },
    });
    expect(restored.statusCode).toBe(201);
    expect(restored.json().id).not.toBe(revisionId);
    expect(
      (
        await app.inject({ url: `/api/profiles/${id}/revisions`, headers: { cookie: alice } })
      ).json(),
    ).toHaveLength(2);
    expect(
      (await app.inject({ url: `/api/profiles/${id}/revisions`, headers: { cookie: bob } }))
        .statusCode,
    ).toBe(404);
  });

  it("authenticates and checks origin before parsing potentially expensive bodies", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/profiles",
          headers: { "content-type": "application/json" },
          payload: "{",
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/profiles",
          headers: {
            cookie: alice,
            origin: "https://hostile.example",
            "content-type": "application/json",
          },
          payload: "{",
        })
      ).statusCode,
    ).toBe(403);
    const response = await app.inject({ url: "/api/profiles", headers: { cookie: alice } });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["cross-origin-embedder-policy"]).toBe("require-corp");
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(
      (await app.inject({ url: "/api/profiles/invalid/revisions", headers: { cookie: alice } }))
        .statusCode,
    ).toBe(400);
  });

  it.each([
    "{",
    "{}",
    "null",
    " ".repeat(5000),
    JSON.stringify({ ...metadata, kind: "snapshot" }),
    JSON.stringify({ ...metadata, baseRevision: "invalid" }),
  ])("rejects malformed metadata %s", async (value) => {
    const id = await profile();
    expect((await upload(id, value)).statusCode).toBe(400);
    expect(
      (
        await app.inject({ url: `/api/profiles/${id}/revisions`, headers: { cookie: alice } })
      ).json(),
    ).toEqual([]);
  });

  it("rejects empty collections, unsafe paths and too many files", async () => {
    const id = await profile();
    expect((await upload(id, metadata, [])).statusCode).toBe(400);
    expect((await upload(id, metadata, ["../escape"])).statusCode).toBe(400);
    expect((await upload(id, metadata, ["same", "SAME"])).statusCode).toBe(400);
    expect(
      (
        await upload(
          id,
          metadata,
          Array.from({ length: 129 }, (_, index) => `file${index}`),
        )
      ).statusCode,
    ).toBe(413);
  });
});
