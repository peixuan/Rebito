import { getMigrations } from "better-auth/db/migration";
import type { Pool } from "pg";
import type { ServerConfig } from "../server/config.ts";
import { identityOptions } from "./auth.ts";

/** Serialize auth schema upgrades across application instances. */
export async function migrateIdentity(config: ServerConfig, database: Pool): Promise<void> {
  const lock = await database.connect();
  try {
    await lock.query("SELECT pg_advisory_lock(740721, 1)");
    const migration = await getMigrations(identityOptions(config, database));
    await migration.runMigrations();
  } finally {
    try {
      await lock.query("SELECT pg_advisory_unlock(740721, 1)");
    } finally {
      lock.release();
    }
  }
}
