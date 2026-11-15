import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SaveService } from "../../src/saves/service.ts";
import { loadConfig } from "../../src/server/config.ts";
import { createPlatform } from "../../src/server/platform.ts";
import { testDatabase } from "../database.ts";
import { deferred } from "../deferred.ts";
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

  it("queues five publications and still rejects competing writes to one head", async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => profile()));
    const responses = await Promise.all(ids.map((id) => upload(id)));
    expect(responses.map((response) => response.statusCode)).toEqual([201, 201, 201, 201, 201]);
    const id = ids[0] as string;
    const baseRevision = responses[0]?.json().id;
    const competing = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        upload(id, { ...metadata, baseRevision }, [`SLOT${index}.DAT`]),
      ),
    );
    expect(competing.map((response) => response.statusCode).sort()).toEqual([
      201, 409, 409, 409, 409,
    ]);
    const history = await app.inject({
      url: `/api/profiles/${id}/revisions`,
      headers: { cookie: alice },
    });
    expect(history.json()).toHaveLength(2);
    const winner = competing.find((response) => response.statusCode === 201)?.json();
    expect(history.json()[0].id).toBe(winner.id);
    expect(winner.parentId).toBe(baseRevision);
    const file = `/api/revisions/${winner.id}/file?name=${winner.manifest.artifacts[0].name}`;
    expect((await app.inject({ url: file, headers: { cookie: alice } })).rawPayload).toEqual(
      Buffer.from([1, 2, 255]),
    );
    expect((await app.inject({ url: file, headers: { cookie: bob } })).statusCode).toBe(404);
  });

  it("removes disconnected HTTP waiters without releasing an active publication", async () => {
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const ids = await Promise.all(Array.from({ length: 5 }, () => profile()));
    const gate = deferred();
    const original = SaveService.prototype.publish;
    const publish = vi.spyOn(SaveService.prototype, "publish").mockImplementation(async function (
      this: SaveService,
      ...args
    ) {
      await gate.promise;
      return original.apply(this, args);
    });
    const responses = new Map<string, import("node:http").ServerResponse>();
    app.server.on("request", (request, response) => responses.set(request.url ?? "", response));
    const controllers = ids.map(() => new AbortController());
    const tasks: Promise<number | string>[] = [];
    const start = (index: number) => {
      const body = new FormData();
      body.append("metadata", JSON.stringify(metadata));
      body.append("file", new Blob([Uint8Array.of(index)]), "SAVE.DAT");
      tasks.push(
        fetch(`${address}/api/profiles/${ids[index]}/revisions`, {
          method: "POST",
          headers: { origin, cookie: alice },
          body,
          signal: controllers[index]?.signal ?? null,
        })
          .then(async (response) => {
            await response.arrayBuffer();
            return response.status;
          })
          .catch((error: Error) => error.name),
      );
    };
    try {
      start(0);
      start(1);
      await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
      start(2);
      start(3);
      start(4);
      await vi.waitFor(() => expect(responses.size).toBe(5));
      for (const index of [0, 2]) {
        const response = responses.get(`/api/profiles/${ids[index]}/revisions`);
        const closed = new Promise<void>((resolve) => response?.once("close", resolve));
        controllers[index]?.abort();
        await closed;
      }
      expect(publish).toHaveBeenCalledTimes(2);
      gate.resolve();
      expect(await Promise.all(tasks)).toEqual(["AbortError", 201, "AbortError", 201, 201]);
      await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(4));
      for (const [index, id] of ids.entries()) {
        const history = (
          await app.inject({ url: `/api/profiles/${id}/revisions`, headers: { cookie: alice } })
        ).json();
        expect(history).toHaveLength(index === 2 ? 0 : 1);
        if (index === 2) continue;
        const file = await app.inject({
          url: `/api/revisions/${history[0].id}/file?name=SAVE.DAT`,
          headers: { cookie: alice },
        });
        expect(file.rawPayload).toEqual(Buffer.from([index]));
      }
    } finally {
      gate.resolve();
      await Promise.allSettled(tasks);
      publish.mockRestore();
    }
  });

  it("rejects queue overflow before publication and permits a safe retry", async () => {
    const ids = await Promise.all(Array.from({ length: 11 }, () => profile()));
    const gate = deferred();
    const original = SaveService.prototype.publish;
    const publish = vi.spyOn(SaveService.prototype, "publish").mockImplementation(async function (
      this: SaveService,
      ...args
    ) {
      await gate.promise;
      return original.apply(this, args);
    });
    const tasks = ids.map(async (id) => ({ id, response: await upload(id) }));
    try {
      const rejected = await Promise.race(tasks);
      expect(rejected.response.statusCode).toBe(503);
      expect(rejected.response.json()).toEqual({ error: "upload_busy" });
      expect(rejected.response.headers["retry-after"]).toBe("1");
      await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
      gate.resolve();
      const results = await Promise.all(tasks);
      expect(results.filter(({ response }) => response.statusCode === 201)).toHaveLength(10);
      expect(
        (
          await app.inject({
            url: `/api/profiles/${rejected.id}/revisions`,
            headers: { cookie: alice },
          })
        ).json(),
      ).toEqual([]);
      expect((await upload(rejected.id)).statusCode).toBe(201);
    } finally {
      gate.resolve();
      await Promise.allSettled(tasks);
      publish.mockRestore();
    }
  });
});
