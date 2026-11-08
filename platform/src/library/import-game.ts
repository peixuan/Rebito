import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { importGame } from "./importer.ts";

const [source, metadata, ...extra] = process.argv.slice(2);
if (!source || !metadata || extra.length) {
  throw new Error("Usage: import-game GAME_FILE METADATA_JSON");
}
const id = await importGame(
  join(process.env.DATA_DIR ?? ".data", "library"),
  source,
  JSON.parse(await readFile(metadata, "utf8")),
  process.env.MAX_LIBRARY_BYTES === undefined ? undefined : Number(process.env.MAX_LIBRARY_BYTES),
);
console.log(`Imported ${id}. Refresh the game library to see it.`);
