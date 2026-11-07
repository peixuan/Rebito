import { isAbsolute } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/server/config.ts";

const environment = {
  APP_ORIGIN: "http://localhost:3000",
  DATABASE_URL: "postgresql://localhost/retro_test",
  AUTH_SECRET: "unit-test-only-secret-do-not-deploy",
};

describe("server configuration", () => {
  it("defaults to closed registration and a loopback listener", () => {
    const config = loadConfig(environment);
    expect(config.allowRegistration).toBe(false);
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(3000);
    expect(config.oidc).toBeUndefined();
    expect(isAbsolute(config.dataDirectory)).toBe(true);
    expect(
      loadConfig({
        ...environment,
        OIDC_DISCOVERY_URL: "",
        OIDC_CLIENT_ID: "",
        OIDC_CLIENT_SECRET: "",
      }).oidc,
    ).toBeUndefined();
  });

  it("accepts explicit deployment and OIDC settings", () => {
    const config = loadConfig({
      ...environment,
      APP_ORIGIN: "https://games.example.com/",
      PORT: "8080",
      HOST: "0.0.0.0",
      DATA_DIR: "private-data",
      ALLOW_REGISTRATION: "true",
      OIDC_DISCOVERY_URL: "https://identity.example.com/.well-known/openid-configuration",
      OIDC_CLIENT_ID: "retro",
      OIDC_CLIENT_SECRET: "test-client-secret",
    });
    expect(config.origin).toBe("https://games.example.com");
    expect(config.port).toBe(8080);
    expect(config.host).toBe("0.0.0.0");
    expect(config.dataDirectory).toContain("private-data");
    expect(config.allowRegistration).toBe(true);
    expect(config.oidc?.clientId).toBe("retro");
  });

  it.each([
    { APP_ORIGIN: "" },
    { APP_ORIGIN: "http://remote.example.com" },
    { APP_ORIGIN: "https://name:secret@example.com" },
    { APP_ORIGIN: "https://example.com/#fragment" },
    { APP_ORIGIN: "https://example.com/path" },
    { APP_ORIGIN: "https://example.com/?query=1" },
    { APP_ORIGIN: "ftp://localhost" },
    { DATABASE_URL: "sqlite://local" },
    { AUTH_SECRET: "short" },
    { PORT: "0" },
    { PORT: "65536" },
    { PORT: "3000.5" },
    { ALLOW_REGISTRATION: "yes" },
    { OIDC_DISCOVERY_URL: "https://identity.example.com" },
    { OIDC_CLIENT_ID: "retro" },
    { OIDC_CLIENT_SECRET: "secret-with-missing-settings" },
  ])("rejects incomplete or unsafe configuration %j", (change) => {
    expect(() => loadConfig({ ...environment, ...change })).toThrow();
  });
});
