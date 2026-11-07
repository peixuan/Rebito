import { join } from "node:path";
import type { Pool } from "pg";
import { registerEditors } from "../editors/routes.ts";
import { EditorService } from "../editors/service.ts";
import { createAuth } from "../identity/auth.ts";
import { migrateIdentity } from "../identity/migrate.ts";
import { privateApi } from "../identity/private-api.ts";
import { registerIdentity } from "../identity/routes.ts";
import { LocalLibrary } from "../library/catalog.ts";
import { registerLibrary } from "../library/routes.ts";
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
  const library = await LocalLibrary.load(join(config.dataDirectory, "library"));
  const saves = new SaveService(
    new RevisionRepository(database, config.storageLimits),
    new LocalBlobStore(join(config.dataDirectory, "blobs")),
  );
  registerIdentity(app, auth, config);
  privateApi(app, auth, config.origin, async (scope) => {
    registerLibrary(scope, library);
    await registerSaves(scope, saves);
    registerEditors(scope, new EditorService(saves, library));
  });
  app.get("/health/ready", async () => {
    await database.query("SELECT 1");
    return { status: "ok" };
  });
  return app;
}
