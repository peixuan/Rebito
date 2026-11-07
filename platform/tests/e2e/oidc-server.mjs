import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Provider from "oidc-provider";
import { loadConfig } from "../../src/server/config.ts";
import { createPlatform } from "../../src/server/platform.ts";
import { registerWeb } from "../../src/server/web.ts";
import { testDatabase } from "../database.ts";
import { seedLibrary } from "../library/fixture.ts";

// Test-only identity provider: its development login accepts any credentials.
// Bind to loopback and never include this fixture in the deployment image.
const origin = "http://localhost:4320";
const provider = new Provider("http://localhost:4319", {
  clients: [
    {
      client_id: "retro-browser-test",
      client_secret: "test-provider-client-secret",
      redirect_uris: [`${origin}/api/auth/callback/oidc`],
      response_types: ["code"],
      grant_types: ["authorization_code"],
      token_endpoint_auth_method: "client_secret_post",
    },
  ],
  cookies: { keys: [randomBytes(32).toString("hex")] },
  pkce: { required: () => true },
  claims: { openid: ["sub"], email: ["email", "email_verified"], profile: ["name"] },
  async findAccount(_context, id) {
    return {
      accountId: id,
      async claims() {
        return {
          sub: id,
          email: `${id}@oidc.example.test`,
          email_verified: true,
          name: `OIDC ${id}`,
        };
      },
    };
  },
});
const identityServer = provider.listen(4319, "127.0.0.1");
const fixture = await testDatabase();
const directory = await mkdtemp(join(tmpdir(), "retro-oidc-browser-"));
await seedLibrary(directory);
const app = await createPlatform(
  loadConfig({
    APP_ORIGIN: origin,
    DATABASE_URL: "postgresql://unused/unused",
    AUTH_SECRET: randomBytes(32).toString("hex"),
    DATA_DIR: directory,
    ALLOW_REGISTRATION: "false",
    OIDC_DISCOVERY_URL: "http://localhost:4319/.well-known/openid-configuration",
    OIDC_CLIENT_ID: "retro-browser-test",
    OIDC_CLIENT_SECRET: "test-provider-client-secret",
  }),
  fixture.database,
);
registerWeb(app, resolve("dist/client"));
app.addHook("onClose", async () => {
  await new Promise((resolve, reject) =>
    identityServer.close((error) => (error ? reject(error) : resolve())),
  );
  await fixture.close();
  await rm(directory, { recursive: true, force: true });
});
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => void app.close());
await app.listen({ host: "127.0.0.1", port: 4320 });
