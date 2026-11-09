import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { catalogSchema, LocalLibrary } from "./catalog.ts";

export type Catalog = ReturnType<typeof catalogSchema.parse>;

export async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === "win32") return;
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** Share one publication lock between imports, configuration and reclamation. */
export async function withCatalog<T>(
  directory: string,
  action: (catalog: Catalog, library: LocalLibrary) => Promise<T>,
): Promise<T> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, ".import.lock");
  // An interrupted process leaves the lock for inspection, never a timed takeover.
  const lock = await open(path, "wx", 0o600);
  try {
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
    return await action(catalog, library);
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
