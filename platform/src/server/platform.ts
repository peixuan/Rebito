import { join } from "node:path";
import type { Pool } from "pg";
import { createAuth } from "../identity/auth.ts";
import { migrateIdentity } from "../identity/migrate.ts";
import { privateApi } from "../identity/private-api.ts";
import { registerIdentity } from "../identity/routes.ts";
import { registerSaves } from "../saves/routes.ts";
import { SaveService } from "../saves/service.ts";
import { LocalBlobStore } from "../storage/blobs.ts";
import { RevisionRepository } from "../storage/revisions.ts";
import { migrateStorage } from "../storage/schema.ts";
import { createApp } from "./app.ts";
import type { ServerConfig } from "./config.ts";

/** Compose real services without opening a port; the caller owns the database pool. */
export async function createPlatform(config: ServerConfig, database: Pool) {
  await migrateIdentity(config, database);
  await migrateStorage(database);
  const auth = createAuth(config, database);
  const app = createApp();
  const saves = new SaveService(
    new RevisionRepository(database),
    new LocalBlobStore(join(config.dataDirectory, "blobs")),
  );
  registerIdentity(app, auth, config);
  privateApi(app, auth, config.origin, async (scope) => {
    await registerSaves(scope, saves);
  });
  app.get("/health/ready", async () => {
    await database.query("SELECT 1");
    return { status: "ok" };
  });
  return app;
}
