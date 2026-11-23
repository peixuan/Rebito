import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { syncDirectory } from "../storage/files.ts";
import { catalogSchema, LocalLibrary } from "./catalog.ts";

export type Catalog = ReturnType<typeof catalogSchema.parse>;

/** Share one publication lock between imports, configuration and reclamation. */
export async function withCatalog<T>(
  directory: string,
  action: (catalog: Catalog, library: LocalLibrary) => Promise<T>,
): Promise<T> {
  return withLibraryLock(directory, async () => {
    const library = await LocalLibrary.load(directory);
    let catalog: Catalog;
    try {
      catalog = catalogSchema.parse(
        JSON.parse(await readFile(join(directory, "catalog.json"), "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      catalog = { version: 1, games: [] };
    }
    return action(catalog, library);
  });
}

/** Firmware-only operations share publication exclusion without hashing every game asset. */
export async function withLibraryLock<T>(directory: string, action: () => Promise<T>): Promise<T> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, ".import.lock");
  // An interrupted process leaves the lock for inspection, never a timed takeover.
  const lock = await open(path, "wx", 0o600);
  try {
    return await action();
  } finally {
    await lock.close();
    await rm(path);
  }
}

/** Caller holds withCatalog; fsync the replacement before publishing its name. */
export async function writeCatalog(directory: string, catalog: Catalog) {
  catalogSchema.parse(catalog);
  const path = join(directory, `${randomUUID()}.json.tmp`);
  try {
    const output = await open(path, "wx", 0o600);
    try {
      await output.writeFile(`${JSON.stringify(catalog, null, 2)}\n`);
      await output.sync();
    } finally {
      await output.close();
    }
    await rename(path, join(directory, "catalog.json"));
    await syncDirectory(directory);
  } finally {
    await rm(path, { force: true });
  }
}
