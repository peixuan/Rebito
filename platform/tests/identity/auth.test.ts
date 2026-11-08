import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { requireAdministrator } from "../../src/identity/administrator.ts";
import { createAuth, identityOptions } from "../../src/identity/auth.ts";
import { migrateIdentity } from "../../src/identity/migrate.ts";
import { privateApi } from "../../src/identity/private-api.ts";
import { registerIdentity } from "../../src/identity/routes.ts";
import { createApp } from "../../src/server/app.ts";
import { loadConfig } from "../../src/server/config.ts";
import { testDatabase } from "../database.ts";

describe("real identity integration", () => {
  let fixture: Awaited<ReturnType<typeof testDatabase>>;
  const app = createApp();
  const adminUserIds: string[] = [];
  const config = {
    ...loadConfig({
      APP_ORIGIN: "http://localhost:3000",
      DATABASE_URL: "postgresql://unused/unused",
      AUTH_SECRET: randomBytes(32).toString("hex"),
      ALLOW_REGISTRATION: "true",
    }),
    adminUserIds,
  };
  const password = "test-password-for-player";
  let nextAddress = 10;

  beforeAll(async () => {
    fixture = await testDatabase();
    await migrateIdentity(config, fixture.database);
    await migrateIdentity(config, fixture.database);
    const auth = createAuth(config, fixture.database);
    registerIdentity(app, auth, config);
    privateApi(app, auth, config.origin, async (scope) => {
      scope.get("/private", async (request) => ({ owner: request.ownerId }));
      scope.post("/private", async (request) => ({ owner: request.ownerId }));
      scope.post("/admin", { onRequest: requireAdministrator(config) }, async () => ({ ok: true }));
    });
  }, 30_000);
  afterAll(async () => {
    await app.close();
    await fixture?.close();
  });

  async function register() {
    const credentials = { email: `${randomUUID()}@example.test`, password };
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      remoteAddress: `192.0.2.${nextAddress++}`,
      headers: { origin: config.origin },
      payload: { ...credentials, name: "Player" },
    });
    const sessionCookie = response.cookies.find((entry) => entry.name === "retro.session_token");
    return {
      credentials,
      response,
      sessionCookie,
      cookie: `retro.session_token=${sessionCookie?.value}`,
    };
  }

  it("registers with a secure session and stores a password hash", async () => {
    const { response, sessionCookie } = await register();
    expect(response.statusCode).toBe(200);
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.sameSite).toBe("Lax");
    expect(sessionCookie?.value).toBeTruthy();
    const stored = await fixture.database.query('SELECT password FROM "account"');
    expect(stored.rows[0].password).not.toBe(password);
    expect(stored.rows[0].password.length).toBeGreaterThan(40);
  });

  it("records fixed identity diagnostic categories without upstream payloads", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const logger = identityOptions(config, fixture.database).logger;
      logger.log("error", "Failed to parse state private-state");
      logger.log("error", 'Provider "oidc": id_token failed verification private-token');
      logger.log("warn", "private remote error details");
      const output = JSON.stringify(log.mock.calls);
      expect(output).not.toContain("private");
      expect(output).toContain("invalid_oauth_state");
      expect(output).toContain("invalid_id_token");
      expect(output).toContain("identity_diagnostic");
    } finally {
      log.mockRestore();
    }
  });

  it("returns only the current user's public identity and rejects cross-site logout", async () => {
    const { cookie } = await register();
    const anonymous = await app.inject("/api/session");
    expect(anonymous.json().user).toBeNull();
    const session = await app.inject({ url: "/api/session", headers: { cookie } });
    expect(session.json().user).toEqual({ id: expect.any(String), name: "Player", admin: false });
    expect(session.headers["cache-control"]).toBe("no-store");
    expect(
      (await app.inject({ url: "/api/auth/get-session", headers: { cookie } })).statusCode,
    ).toBe(200);
    const hostile = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { cookie, origin: "https://hostile.example" },
      payload: {},
    });
    expect(hostile.statusCode).toBe(403);
    expect((await app.inject("/private")).statusCode).toBe(401);
    expect((await app.inject({ url: "/private", headers: { cookie } })).json().owner).toBe(
      session.json().user.id,
    );
    expect(
      (await app.inject({ method: "POST", url: "/private", headers: { cookie } })).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/private",
          headers: { cookie, origin: config.origin },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("requires an operator-listed identity, ignoring submitted admin flags and forged headers", async () => {
    const { cookie, response } = await register();
    const request = {
      method: "POST",
      url: "/admin",
      headers: { cookie, origin: config.origin, "x-admin": "true" },
      payload: { admin: true, role: "admin" },
    } as const;
    expect((await app.inject({ method: "POST", url: "/admin" })).statusCode).toBe(401);
    expect((await app.inject(request)).statusCode).toBe(403);
    const id = response.json().user.id;
    adminUserIds.push(id);
    expect((await app.inject(request)).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/session", headers: { cookie } })).json().user.admin).toBe(
      true,
    );
    expect(
      (await app.inject({ ...request, headers: { cookie, origin: "https://elsewhere.test" } }))
        .statusCode,
    ).toBe(403);
    adminUserIds.splice(0);
    expect((await app.inject(request)).statusCode).toBe(403);
  });

  it("rejects bad credentials and invalidates a signed-out session", async () => {
    const { credentials, cookie } = await register();
    const invalid = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { ...credentials, password: "incorrect-password" },
    });
    expect(invalid.statusCode).toBe(401);
    const signedOut = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { cookie, origin: config.origin },
      payload: {},
    });
    expect(signedOut.statusCode).toBe(200);
    expect((await app.inject({ url: "/api/session", headers: { cookie } })).json().user).toBeNull();
    const signedIn = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: credentials,
    });
    expect(signedIn.statusCode).toBe(200);
  });

  it("disables registration when configured and requires verified OIDC identity", async () => {
    const closed = createAuth({ ...config, allowRegistration: false }, fixture.database);
    const response = await closed.handler(
      new Request(`${config.origin}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, email: "other@example.test", name: "Other" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "EMAIL_PASSWORD_SIGN_UP_DISABLED" });
    const oidc = identityOptions(
      {
        ...config,
        oidc: { discoveryUrl: "https://id.example.test", clientId: "test", clientSecret: "test" },
      },
      fixture.database,
    );
    expect(oidc.plugins[0]?.options.config[0]).toMatchObject({
      pkce: true,
      requireIdTokenVerification: true,
    });
  });

  it("rate-limits login attempts even when the caller forges client-IP headers", async () => {
    let limited = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/sign-in/email",
        remoteAddress: "192.0.2.50",
        headers: {
          "x-retro-client-ip": `192.0.2.${attempt}`,
          "x-forwarded-for": `192.0.2.${attempt}`,
        },
        payload: { email: "absent@example.test", password },
      });
      if (response.statusCode === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});
