import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateIdentity } from "../../src/identity/migrate.ts";
import { SaveService } from "../../src/saves/service.ts";
import { loadConfig } from "../../src/server/config.ts";
import { StorageActivity } from "../../src/storage/activity.ts";
import { LocalBlobStore } from "../../src/storage/blobs.ts";
import { RevisionRepository } from "../../src/storage/revisions.ts";
import { migrateStorage } from "../../src/storage/schema.ts";
import { testDatabase } from "../database.ts";

export async function historyFixture() {
  const fixture = await testDatabase();
  const directory = await mkdtemp(join(tmpdir(), "history-test-"));
  const config = loadConfig({
    APP_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "postgresql://unused/unused",
    AUTH_SECRET: randomBytes(32).toString("hex"),
    DATA_DIR: directory,
    ALLOW_REGISTRATION: "true",
  });
  await migrateIdentity(config, fixture.database);
  await migrateStorage(fixture.database);
  for (const owner of ["alice", "bob"])
    await fixture.database.query(
      `INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES ($1,$1,$2,false,now(),now())`,
      [owner, `${owner}@example.test`],
    );
  const activity = await StorageActivity.open(fixture.database);
  const repository = new RevisionRepository(fixture.database);
  const service = new SaveService(repository, new LocalBlobStore(join(directory, "blobs"), 0));
  let sequence = 0;
  return {
    database: fixture.database,
    directory,
    config,
    activity,
    repository,
    service,
    async append(profileId: string, base: string | null, value: number, owner = "alice") {
      const revision = await service.publish(
        owner,
        profileId,
        base,
        { kind: "game-save", releaseId: "test-game" },
        [{ name: "save.dat", bytes: Uint8Array.of(value) }],
        "game",
      );
      await fixture.database.query("UPDATE revisions SET created_at=$1 WHERE id=$2", [
        new Date(Date.now() - 100_000 + sequence++ * 1000),
        revision.id,
      ]);
      return repository.read(owner, revision.id);
    },
    async close() {
      await activity.close();
      await fixture.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
