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
    expect(config.adminUserIds).toEqual([]);
    expect(config.initialAdmin).toBeUndefined();
    expect(config.siteSaveLimits).toEqual({ bytes: 10 * 1024 ** 3, revisions: 10_000 });
    expect(config.maximumLibraryBytes).toBe(10 * 1024 ** 3);
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(3000);
    expect(config.minimumFreeBytes).toBe(1024 ** 3);
    expect(config.oidc).toBeUndefined();
    expect(config.storageLimits).toEqual({ profiles: 100, revisions: 2000, bytes: 2147483648 });
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
      ADMIN_USER_IDS: " first-user, second_user ",
      MAX_LIBRARY_BYTES: "2048",
      MAX_TOTAL_SAVE_BYTES: "4096",
      MAX_TOTAL_REVISIONS: "20",
      MAX_PROFILES_PER_USER: "20",
      MAX_REVISIONS_PER_USER: "100",
      MAX_SAVE_BYTES_PER_USER: "1073741824",
      MIN_FREE_DISK_BYTES: "536870912",
      OIDC_DISCOVERY_URL: "https://identity.example.com/.well-known/openid-configuration",
      OIDC_CLIENT_ID: "retro",
      OIDC_CLIENT_SECRET: "test-client-secret",
    });
    expect(config.origin).toBe("https://games.example.com");
    expect(config.port).toBe(8080);
    expect(config.minimumFreeBytes).toBe(536870912);
    expect(config.host).toBe("0.0.0.0");
    expect(config.dataDirectory).toContain("private-data");
    expect(config.allowRegistration).toBe(true);
    expect(config.adminUserIds).toEqual(["first-user", "second_user"]);
    expect(config.maximumLibraryBytes).toBe(2048);
    expect(config.siteSaveLimits).toEqual({ bytes: 4096, revisions: 20 });
    expect(config.storageLimits).toEqual({ profiles: 20, revisions: 100, bytes: 1073741824 });
    expect(config.oidc?.clientId).toBe("retro");
  });

  it("validates initial administrator settings without exposing the password", () => {
    const credentials = {
      INITIAL_ADMIN_EMAIL: " Operator@Example.test ",
      INITIAL_ADMIN_PASSWORD: "unit-test-only-password",
      INITIAL_ADMIN_NAME: " Operator ",
    };
    expect(loadConfig({ ...environment, ...credentials }).initialAdmin).toEqual({
      email: "operator@example.test",
      password: credentials.INITIAL_ADMIN_PASSWORD,
      name: "Operator",
    });
    for (const change of [
      { INITIAL_ADMIN_EMAIL: "" },
      { INITIAL_ADMIN_EMAIL: "not-an-email" },
      { INITIAL_ADMIN_PASSWORD: "" },
      { INITIAL_ADMIN_PASSWORD: "short" },
      { INITIAL_ADMIN_PASSWORD: "private-value".repeat(20) },
      { INITIAL_ADMIN_NAME: "a".repeat(101) },
    ]) {
      expect(() => loadConfig({ ...environment, ...credentials, ...change })).toThrow(
        "Initial administrator requires",
      );
    }
    expect(() => loadConfig({ ...environment, INITIAL_ADMIN_NAME: "Operator" })).toThrow();
    expect(
      loadConfig({ ...environment, INITIAL_ADMIN_EMAIL: "", INITIAL_ADMIN_PASSWORD: "" })
        .initialAdmin,
    ).toBeUndefined();
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
    { ADMIN_USER_IDS: "email@example.test" },
    { ADMIN_USER_IDS: "user id" },
    { MAX_TOTAL_REVISIONS: "-1" },
    { MAX_TOTAL_SAVE_BYTES: "0" },
    { MAX_TOTAL_SAVE_BYTES: "Infinity" },
    { MAX_LIBRARY_BYTES: "0" },
    { MAX_LIBRARY_BYTES: "Infinity" },
    { MAX_PROFILES_PER_USER: "0" },
    { MAX_REVISIONS_PER_USER: "1.5" },
    { MAX_SAVE_BYTES_PER_USER: "Infinity" },
    { MAX_SAVE_BYTES_PER_USER: "-1" },
    { MIN_FREE_DISK_BYTES: "-1" },
    { MIN_FREE_DISK_BYTES: "1.5" },
    { MIN_FREE_DISK_BYTES: "Infinity" },
    { OIDC_DISCOVERY_URL: "https://identity.example.com" },
    { OIDC_CLIENT_ID: "retro" },
    { OIDC_CLIENT_SECRET: "secret-with-missing-settings" },
  ])("rejects incomplete or unsafe configuration %j", (change) => {
    expect(() => loadConfig({ ...environment, ...change })).toThrow();
  });
});
