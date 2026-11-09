import { randomBytes } from "node:crypto";
import { lstat, mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createAuth } from "../../src/identity/auth.ts";
import {
  beginDeletion,
  deletionImpact,
  pendingDeletions,
} from "../../src/library/deletion-records.ts";
import { reclaimDeletion } from "../../src/library/reclamation.ts";
import { withCatalog } from "../../src/library/transaction.ts";
import { SaveService } from "../../src/saves/service.ts";
import { loadConfig } from "../../src/server/config.ts";
import { createPlatform } from "../../src/server/platform.ts";
import { LocalBlobStore } from "../../src/storage/blobs.ts";
import { RevisionRepository } from "../../src/storage/revisions.ts";
import { testDatabase } from "../database.ts";
import { seedLibrary } from "./fixture.ts";

let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: Awaited<ReturnType<typeof createPlatform>>;
let directory: string;
let owner: string;
let game: Awaited<ReturnType<typeof seedLibrary>>;
let service: SaveService;
beforeAll(async () => {
  fixture = await testDatabase();
  directory = await mkdtemp(join(tmpdir(), "game-reclamation-"));
  game = await seedLibrary(directory);
  const config = loadConfig({
    APP_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "postgresql://unused/unused",
    AUTH_SECRET: randomBytes(32).toString("hex"),
    DATA_DIR: directory,
    ALLOW_REGISTRATION: "true",
  });
  app = await createPlatform(config, fixture.database);
  owner = (
    await createAuth(config, fixture.database).api.signUpEmail({
      body: { email: "reclaim@example.test", name: "Reclaim", password: "reclaim-test-password" },
    })
  ).user.id;
  service = new SaveService(
    new RevisionRepository(fixture.database),
    new LocalBlobStore(join(directory, "blobs"), 0),
  );
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it("unlinks actual game/save files, retains shared bytes, and retries interrupted cleanup safely", async () => {
  const profile = await service.revisions.create(owner, game.id, "Delete me");
  const files = [
    { name: "unique.sav", bytes: Uint8Array.of(11, 12, 13) },
    { name: "shared.sav", bytes: Uint8Array.of(21, 22) },
  ] as const;
  const revision = await service.publish(
    owner,
    profile.id,
    null,
    { kind: "game-save", releaseId: game.id },
    files,
    "game",
  );
  const other = await service.revisions.create(owner, "other-release", "Keep me");
  const kept = await service.publish(
    owner,
    other.id,
    null,
    { kind: "game-save", releaseId: "other-release" },
    [files[1]],
    "game",
  );
  const job = await withCatalog(join(directory, "library"), async (catalog) => {
    const entry = catalog.games[0];
    if (!entry) throw new Error("Missing fixture");
    const { preview } = await deletionImpact(fixture.database, catalog, entry);
    return beginDeletion(fixture.database, catalog, entry, {
      token: preview.token,
      title: entry.title,
      deleteSaves: true,
    });
  });
  let calls = 0;
  await expect(
    reclaimDeletion(fixture.database, directory, job, async (path) => {
      if (++calls === 2) throw new Error("simulated unlink failure");
      await unlink(path);
    }),
  ).rejects.toThrow("unlink failure");
  expect(
    JSON.parse(await readFile(join(directory, "library", "catalog.json"), "utf8")).games,
  ).toEqual([]);
  await expect(lstat(join(directory, "library", "game.fixture"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(await pendingDeletions(fixture.database)).toHaveLength(1);
  const result = await reclaimDeletion(fixture.database, directory, job);
  expect(result).toMatchObject({ status: "deleted", reclaimedBytes: 3, profiles: 1, revisions: 1 });
  await expect(
    lstat(join(directory, "blobs", revision.manifest.artifacts[0]?.sha256 ?? "missing")),
  ).rejects.toMatchObject({ code: "ENOENT" });
  expect(await service.file(owner, kept.id, "shared.sav")).toEqual(Buffer.from(files[1].bytes));
  expect(await pendingDeletions(fixture.database)).toEqual([]);
  expect((await service.revisions.usage(owner)).used).toEqual({
    profiles: 1,
    revisions: 1,
    bytes: 2,
  });
});

it("rechecks references when a failed cleanup candidate is reused by another game", async () => {
  await seedLibrary(directory);
  const profile = await service.revisions.create(owner, game.id, "Delete after failure");
  const file = { name: "newly-shared.sav", bytes: Uint8Array.of(51, 52, 53, 54) };
  await service.publish(
    owner,
    profile.id,
    null,
    { kind: "game-save", releaseId: game.id },
    [file],
    "game",
  );
  const job = await withCatalog(join(directory, "library"), async (catalog) => {
    const entry = catalog.games[0];
    if (!entry) throw new Error("Missing fixture");
    const { preview } = await deletionImpact(fixture.database, catalog, entry);
    return beginDeletion(fixture.database, catalog, entry, {
      token: preview.token,
      title: entry.title,
      deleteSaves: true,
    });
  });
  await expect(
    reclaimDeletion(fixture.database, directory, job, async () => {
      throw new Error("failed");
    }),
  ).rejects.toThrow("failed");
  const other = await service.revisions.create(owner, "other-release", "New reference");
  const kept = await service.publish(
    owner,
    other.id,
    null,
    { kind: "game-save", releaseId: "other-release" },
    [file],
    "game",
  );
  expect((await reclaimDeletion(fixture.database, directory, job)).reclaimedBytes).toBe(
    game.bytes.length,
  );
  expect(await service.file(owner, kept.id, file.name)).toEqual(Buffer.from(file.bytes));
});
