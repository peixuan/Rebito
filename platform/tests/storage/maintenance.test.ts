import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createAuth } from "../../src/identity/auth.ts";
import { loadConfig, type ServerConfig } from "../../src/server/config.ts";
import { createPlatform } from "../../src/server/platform.ts";
import { LocalBlobStore } from "../../src/storage/blobs.ts";
import { maintainStorage, storageLease } from "../../src/storage/maintenance.ts";
import { RevisionRepository } from "../../src/storage/revisions.ts";
import { testDatabase } from "../database.ts";

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let directory: string;
let app: Awaited<ReturnType<typeof createPlatform>>;
let referenced: string;
let config: ServerConfig;
beforeAll(async () => {
  fixture = await testDatabase();
  directory = await mkdtemp(join(tmpdir(), "retro-maintenance-"));
  config = loadConfig({
    APP_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "postgresql://unused/unused",
    AUTH_SECRET: randomBytes(32).toString("hex"),
    DATA_DIR: directory,
    ALLOW_REGISTRATION: "true",
  });
  app = await createPlatform(config, fixture.database);
  const account = await createAuth(config, fixture.database).api.signUpEmail({
    body: {
      email: "maintenance@example.test",
      name: "Maintenance",
      password: "test-maintenance-password",
    },
  });
  const repository = new RevisionRepository(fixture.database);
  const profile = await repository.create(account.user.id, "fixture", "Retained progress");
  const blob = await new LocalBlobStore(join(directory, "blobs")).put(Uint8Array.of(1, 2, 3));
  referenced = blob.sha256;
  await repository.publish(
    account.user.id,
    profile.id,
    null,
    { kind: "game-save", releaseId: "fixture", artifacts: [{ name: "SAVE.DAT", ...blob }] },
    "game",
  );
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it("excludes maintenance while an application is running and excludes new apps during maintenance", async () => {
  await expect(maintainStorage(fixture.database, directory)).rejects.toThrow("Storage is in use");
  await app.close();
  const release = await storageLease(fixture.database, true);
  try {
    await expect(storageLease(fixture.database, false)).rejects.toThrow("Storage is in use");
  } finally {
    await release();
  }
});

it("verifies all references before removing only orphan blobs and temporary writes", async () => {
  const root = join(directory, "blobs");
  const orphan = "a".repeat(64);
  const temporary = "00000000-0000-4000-8000-000000000000.tmp";
  await writeFile(join(root, orphan), "orphan");
  await writeFile(join(root, temporary), "temporary");
  await writeFile(join(root, "operator-note"), "keep");
  expect(await maintainStorage(fixture.database, directory)).toMatchObject({
    revisions: 1,
    referencedBlobs: 1,
    orphanFiles: 2,
    orphanBytes: 15,
    removed: 0,
  });
  await writeFile(join(root, referenced), "corrupt");
  await expect(maintainStorage(fixture.database, directory, true)).rejects.toThrow("integrity");
  expect(await readFile(join(root, orphan), "utf8")).toBe("orphan");
  await writeFile(join(root, referenced), Uint8Array.of(1, 2, 3));
  expect((await maintainStorage(fixture.database, directory, true)).removed).toBe(2);
  expect(await readFile(join(root, "operator-note"), "utf8")).toBe("keep");
  expect(await readFile(join(root, referenced))).toEqual(Buffer.from([1, 2, 3]));
  await mkdir(join(root, orphan));
  await expect(maintainStorage(fixture.database, directory, true)).rejects.toThrow("non-file");
  await rmdir(join(root, orphan));
});

it("runs the offline CLI against the disposable database", async () => {
  const name = (await fixture.database.query("SELECT current_database() AS name")).rows[0].name;
  const url = new URL(process.env.PG_TEST_URL ?? "");
  url.pathname = `/${name}`;
  const run = promisify(execFile);
  const cli = resolve("src/storage/maintain-storage.ts");
  const result = await run(process.execPath, [cli, "verify"], {
    env: { ...process.env, DATABASE_URL: url.href, DATA_DIR: directory },
  });
  expect(JSON.parse(result.stdout)).toMatchObject({ referencedBlobs: 1, orphanFiles: 0 });
  await expect(run(process.execPath, [cli, "invalid"])).rejects.toMatchObject({ code: 1 });
});

it("releases the app lease before the caller closes its database pool", async () => {
  const name = (await fixture.database.query("SELECT current_database() AS name")).rows[0].name;
  const url = new URL(process.env.PG_TEST_URL ?? "");
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.href });
  const instance = await createPlatform(config, pool);
  await instance.close();
  await pool.end();
  const release = await storageLease(fixture.database, true);
  await release();
});
