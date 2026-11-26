import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { loadConfig } from "../../src/server/config.ts";
import { createPlatform } from "../../src/server/platform.ts";
import { testDatabase } from "../database.ts";

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: Awaited<ReturnType<typeof createPlatform>>;
let directory: string;
const cookies: Record<string, string> = {};
const origin = "http://localhost:3000";

beforeAll(async () => {
  fixture = await testDatabase();
  directory = await mkdtemp(join(tmpdir(), "rebito-rate-limit-"));
  const adminUserIds: string[] = [];
  app = await createPlatform(
    {
      ...loadConfig({
        APP_ORIGIN: origin,
        DATABASE_URL: "postgresql://unused/unused",
        AUTH_SECRET: randomBytes(32).toString("hex"),
        DATA_DIR: directory,
        ALLOW_REGISTRATION: "true",
      }),
      adminUserIds,
    },
    fixture.database,
  );
  app.log.level = "silent";
  for (const name of ["admin", "other", "player"]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin },
      payload: { email: `${name}@example.test`, name, password: "rate-limit-test-password" },
    });
    expect(response.statusCode).toBe(200);
    cookies[name] = response.cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
    if (name !== "player") adminUserIds.push(response.json().user.id);
  }
}, 30_000);

afterAll(async () => {
  await app?.close();
  await fixture?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it("shares the private API limit across library and quota routes without blocking other users", async () => {
  const routes = [
    { method: "GET", url: "/api/games" },
    { method: "GET", url: "/api/admin/deletions" },
    { method: "POST", url: "/api/admin/games" },
    { method: "GET", url: "/api/admin/save-quotas" },
    { method: "POST", url: "/api/admin/save-quotas" },
  ] as const;
  for (const route of routes) {
    expect((await app.inject(route)).statusCode).toBe(401);
    if (route.url.startsWith("/api/admin/")) {
      const denied = await app.inject({ ...route, headers: { origin, cookie: cookies.player } });
      expect(denied.statusCode).toBe(403);
    }
  }

  // Exercise the production limit and real database/authentication hooks, not mocks.
  const reads = routes.filter((route) => route.method === "GET");
  for (let index = 0; index < 240; index++) {
    const route = reads[index % reads.length];
    if (!route) throw new Error("Missing private read route");
    const response = await app.inject({
      ...route,
      headers: { cookie: cookies.admin },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-ratelimit-limit"]).toBe("240");
    expect(Number(response.headers["x-ratelimit-remaining"])).toBe(239 - index);
  }
  for (const route of routes) {
    const blocked = await app.inject({
      ...route,
      remoteAddress: "192.0.2.42",
      headers: { origin, cookie: cookies.admin, "x-forwarded-for": "192.0.2.43" },
    });
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  }
  const other = await app.inject({
    method: "GET",
    url: "/api/admin/save-quotas",
    headers: { cookie: cookies.other },
  });
  expect(other.statusCode).toBe(200);
  expect(Number(other.headers["x-ratelimit-remaining"])).toBe(239);
}, 30_000);
