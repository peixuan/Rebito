import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAuth } from "../../src/identity/auth.ts";
import { initializeAdministrator } from "../../src/identity/bootstrap.ts";
import { migrateIdentity } from "../../src/identity/migrate.ts";
import { loadConfig } from "../../src/server/config.ts";
import { createPlatform } from "../../src/server/platform.ts";
import { testDatabase } from "../database.ts";

const config = loadConfig({
  APP_ORIGIN: "http://localhost:3000",
  DATABASE_URL: "postgresql://unused/unused",
  AUTH_SECRET: randomBytes(32).toString("hex"),
  INITIAL_ADMIN_EMAIL: "Administrator@Example.test",
  INITIAL_ADMIN_PASSWORD: randomBytes(24).toString("hex"),
  INITIAL_ADMIN_NAME: "Operator",
});
const { initialAdmin: credentials, ...withoutAdministrator } = config;
if (!credentials) throw new Error("Missing test administrator configuration");
let fixture: Awaited<ReturnType<typeof testDatabase>>;
beforeEach(async () => {
  fixture = await testDatabase();
  await migrateIdentity(config, fixture.database);
});
afterEach(async () => fixture?.close());

it("does not create an implicit account when initialization is disabled", async () => {
  expect(await initializeAdministrator(withoutAdministrator, fixture.database)).toBeUndefined();
  expect((await fixture.database.query('SELECT id FROM "user"')).rowCount).toBe(0);
});

it("serializes competing startups and preserves the account after environment changes", async () => {
  const ids = await Promise.all([
    initializeAdministrator(config, fixture.database),
    initializeAdministrator(config, fixture.database),
  ]);
  expect(ids[0]).toBeTruthy();
  expect(ids[1]).toBe(ids[0]);
  const accounts = await fixture.database.query('SELECT password FROM "account"');
  expect(accounts.rowCount).toBe(1);
  expect(accounts.rows[0].password).not.toBe(credentials.password);
  expect((await fixture.database.query('SELECT id FROM "session"')).rowCount).toBe(0);
  const auth = createAuth(config, fixture.database);
  expect((await auth.api.signInEmail({ body: credentials })).user.id).toBe(ids[0]);
  const changed = {
    ...credentials,
    email: "replacement@example.test",
    password: randomBytes(24).toString("hex"),
  };
  expect(
    await initializeAdministrator({ ...config, initialAdmin: changed }, fixture.database),
  ).toBe(ids[0]);
  expect(await initializeAdministrator(withoutAdministrator, fixture.database)).toBe(ids[0]);
  expect((await auth.api.signInEmail({ body: credentials })).user.id).toBe(ids[0]);
  await expect(
    auth.api.signInEmail({ body: { ...credentials, password: changed.password } }),
  ).rejects.toThrow();
  expect((await fixture.database.query('SELECT id FROM "user"')).rowCount).toBe(1);
});

it("refuses to promote an existing ordinary account with the same email", async () => {
  const auth = createAuth({ ...config, allowRegistration: true }, fixture.database);
  const ordinary = await auth.api.signUpEmail({ body: credentials });
  await expect(initializeAdministrator(config, fixture.database)).rejects.toThrow(
    "never overwritten",
  );
  expect((await fixture.database.query("SELECT * FROM bootstrap_administrator")).rowCount).toBe(0);
  expect((await auth.api.signInEmail({ body: credentials })).user.id).toBe(ordinary.user.id);
});

it("rolls back failed credential creation and resumes the reserved identity", async () => {
  await fixture.database.query(`CREATE FUNCTION reject_bootstrap_credential() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'private database detail'; END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER reject_bootstrap_credential BEFORE INSERT ON "account"
    FOR EACH ROW EXECUTE FUNCTION reject_bootstrap_credential()`);
  await expect(initializeAdministrator(config, fixture.database)).rejects.toThrow(
    "Administrator initialization failed; existing accounts are never overwritten.",
  );
  const reserved = (await fixture.database.query("SELECT * FROM bootstrap_administrator")).rows[0];
  expect(reserved.complete).toBe(false);
  expect((await fixture.database.query('SELECT id FROM "user"')).rowCount).toBe(0);
  await fixture.database.query('DROP TRIGGER reject_bootstrap_credential ON "account"');
  await expect(initializeAdministrator(withoutAdministrator, fixture.database)).rejects.toThrow();
  await expect(
    initializeAdministrator(
      { ...config, initialAdmin: { ...credentials, email: "different@example.test" } },
      fixture.database,
    ),
  ).rejects.toThrow();
  expect(await initializeAdministrator(config, fixture.database)).toBe(reserved.user_id);
});

it("recovers a completed signup if recording completion was interrupted", async () => {
  await initializeAdministrator(withoutAdministrator, fixture.database);
  await fixture.database.query(`CREATE FUNCTION reject_bootstrap_completion() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'private database detail'; END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER reject_bootstrap_completion BEFORE UPDATE ON bootstrap_administrator
    FOR EACH ROW EXECUTE FUNCTION reject_bootstrap_completion()`);
  await expect(initializeAdministrator(config, fixture.database)).rejects.toThrow(
    "never overwritten",
  );
  const reserved = (await fixture.database.query("SELECT * FROM bootstrap_administrator")).rows[0];
  expect(reserved.complete).toBe(false);
  expect((await fixture.database.query('SELECT id FROM "user"')).rows[0].id).toBe(reserved.user_id);
  await fixture.database.query(
    "DROP TRIGGER reject_bootstrap_completion ON bootstrap_administrator",
  );
  expect(await initializeAdministrator(config, fixture.database)).toBe(reserved.user_id);
  expect((await fixture.database.query('SELECT id FROM "account"')).rowCount).toBe(1);
});

it("grants real management access across restart without enabling public registration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "retro-bootstrap-"));
  try {
    for (const startupConfig of [config, withoutAdministrator]) {
      const app = await createPlatform(
        { ...startupConfig, dataDirectory: directory },
        fixture.database,
      );
      try {
        const login = await app.inject({
          method: "POST",
          url: "/api/auth/sign-in/email",
          payload: credentials,
        });
        expect(login.statusCode).toBe(200);
        const cookie = login.cookies.map((entry) => `${entry.name}=${entry.value}`).join("; ");
        expect(
          (await app.inject({ url: "/api/session", headers: { cookie } })).json().user.admin,
        ).toBe(true);
        expect(
          (await app.inject({ url: "/api/admin/games", headers: { cookie } })).statusCode,
        ).toBe(200);
        const signup = await app.inject({
          method: "POST",
          url: "/api/auth/sign-up/email",
          payload: { ...credentials, email: "public@example.test" },
        });
        expect(signup.statusCode).toBe(400);
      } finally {
        await app.close();
      }
    }
  } finally {
    // Only the absolute directory created by this test is removed.
    await rm(directory, { recursive: true, force: true });
  }
});
