import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { StorageActivity } from "../storage/activity.ts";
import { storageLease } from "../storage/maintenance.ts";
import { assertNoPendingDeletion } from "./deletion-records.ts";
import { importGame } from "./importer.ts";

const [source, metadata, ...extra] = process.argv.slice(2);
if (!source || !metadata || extra.length) {
  throw new Error("Usage: import-game GAME_FILE METADATA_JSON");
}
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required; import into an initialized deployment");
const database = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
let release: (() => Promise<void>) | undefined;
let activity: StorageActivity | undefined;
try {
  release = await storageLease(database, false);
  activity = await StorageActivity.open(database);
  const id = await activity.run(false, async () => {
    await assertNoPendingDeletion(database);
    return importGame(
      join(process.env.DATA_DIR ?? ".data", "library"),
      source,
      JSON.parse(await readFile(metadata, "utf8")),
      process.env.MAX_LIBRARY_BYTES === undefined
        ? undefined
        : Number(process.env.MAX_LIBRARY_BYTES),
    );
  });
  console.log(`Imported ${id}. Refresh the game library to see it.`);
} finally {
  await activity?.close();
  await release?.();
  await database.end();
}
