import { join } from "node:path";
import type { Pool } from "pg";
import { registerEditors } from "../editors/routes.ts";
import { EditorService } from "../editors/service.ts";
import { createAuth } from "../identity/auth.ts";
import { initializeAdministrator } from "../identity/bootstrap.ts";
import { migrateIdentity } from "../identity/migrate.ts";
import { privateApi } from "../identity/private-api.ts";
import { registerIdentity } from "../identity/routes.ts";
import { registerGameAdministration } from "../library/admin-routes.ts";
import { LocalLibrary } from "../library/catalog.ts";
import { registerConfiguration } from "../library/configuration-routes.ts";
import { assertNoPendingDeletion, pendingDeletions } from "../library/deletion-records.ts";
import { registerDeletions } from "../library/deletion-routes.ts";
import { seedFirmware } from "../library/firmware.ts";
import { registerFirmware } from "../library/firmware-routes.ts";
import { reclaimDeletion } from "../library/reclamation.ts";
import { registerLibrary } from "../library/routes.ts";
import { registerHistory } from "../saves/history-routes.ts";
import { registerSaves } from "../saves/routes.ts";
import { SaveService } from "../saves/service.ts";
import { guardStorageRoutes, StorageActivity } from "../storage/activity.ts";
import { LocalBlobStore } from "../storage/blobs.ts";
import { DiskSpaceError } from "../storage/capacity.ts";
import { storageLease } from "../storage/maintenance.ts";
import { RevisionRepository } from "../storage/revisions.ts";
import { migrateStorage } from "../storage/schema.ts";
import { createApp } from "./app.ts";
import type { ServerConfig } from "./config.ts";

/** Compose real services without opening a port; the caller owns the database pool. */
export async function createPlatform(config: ServerConfig, database: Pool) {
  const release = await storageLease(database, false);
  let activity: StorageActivity | undefined;
  try {
    activity = await StorageActivity.open(database);
    const app = await createServices(config, database, activity);
    app.addHook("onClose", async () => {
      await activity?.close();
      await release();
    });
    return app;
  } catch (error) {
    await activity?.close();
    await release();
    throw error;
  }
}

async function createServices(config: ServerConfig, database: Pool, activity: StorageActivity) {
  await migrateIdentity(config, database);
  const administratorId = await initializeAdministrator(config, database);
  if (administratorId)
    config = { ...config, adminUserIds: [...new Set([...config.adminUserIds, administratorId])] };
  await migrateStorage(database);
  const auth = createAuth(config, database);
  const app = createApp();
  await activity.run(true, async () => {
    for (const job of await pendingDeletions(database)) {
      try {
        await reclaimDeletion(database, config.dataDirectory, job);
      } catch (error) {
        app.log.error({ err: error }, "Pending game cleanup retained for retry");
      }
    }
    if (!(await pendingDeletions(database)).length) {
      try {
        await seedFirmware(join(config.dataDirectory, "library"), config.minimumFreeBytes);
      } catch (error) {
        if (!(error instanceof DiskSpaceError)) throw error;
        app.log.warn("BIOS adoption deferred until storage has sufficient free space");
      }
    }
  });
  const library = await LocalLibrary.load(join(config.dataDirectory, "library"));
  const saves = new SaveService(
    new RevisionRepository(database, config.storageLimits),
    new LocalBlobStore(join(config.dataDirectory, "blobs"), config.minimumFreeBytes),
  );
  registerIdentity(app, auth, config);
  privateApi(app, auth, config.origin, async (scope) => {
    guardStorageRoutes(scope, activity);
    registerLibrary(scope, library, database);
    await registerSaves(scope, saves, library, database);
    registerHistory(scope, database, config.dataDirectory, config.storageLimits);
    registerGameAdministration(scope, config, library, () => assertNoPendingDeletion(database));
    registerConfiguration(scope, config, library, () => assertNoPendingDeletion(database));
    registerFirmware(scope, config, () => assertNoPendingDeletion(database));
    registerDeletions(scope, config, library, database);
    registerEditors(scope, new EditorService(saves, library));
  });
  app.get("/health/ready", async () => {
    await database.query("SELECT 1");
    return { status: "ok" };
  });
  return app;
}
