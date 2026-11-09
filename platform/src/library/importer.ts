import { randomUUID } from "node:crypto";
import { copyFile, link, open, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { message } from "../shared/messages.ts";
import { catalogSchema, fingerprint, releaseId } from "./catalog.ts";
import { syncDirectory, withCatalog, writeCatalog } from "./transaction.ts";
import { defaultLibraryBytes, LibraryError } from "./upload-settings.ts";

const shape = catalogSchema.shape.games.element.shape;
const metadataSchema = z.strictObject({
  title: shape.title,
  system: shape.system,
  saveFiles: shape.saveFiles,
  editor: shape.editor,
});

/** Publication is atomic; running readers verify the next catalog snapshot on demand. */
export async function importGame(
  directory: string,
  source: string,
  metadata: unknown,
  maximumBytes = defaultLibraryBytes,
) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
    throw new Error("Invalid library quota");
  const settings = metadataSchema.parse(metadata);
  const sourceInfo = await stat(source);
  if (!sourceInfo.isFile() || sourceInfo.size < 1 || sourceInfo.size > 512 * 1024 * 1024)
    throw new Error("Expected a game file between 1 byte and 512 MiB");
  return withCatalog(directory, async (catalog, library) => {
    const temporary = join(directory, `${randomUUID()}.tmp`);
    try {
      const usedBytes = catalog.games.reduce((total, entry) => total + entry.size, 0);
      const checkCapacity = (size: number) => {
        if (usedBytes + size > maximumBytes || catalog.games.length >= 5000)
          throw new LibraryError(message("library.quota"), 507);
      };
      checkCapacity(sourceInfo.size);
      // Hash our copy, not the source: source changes cannot publish an incorrect digest.
      await copyFile(source, temporary);
      const bytes = await fingerprint(temporary);
      const entry = catalogSchema.shape.games.element.parse({
        ...settings,
        ...bytes,
        file: `${bytes.sha256}.asset`,
      });
      const id = releaseId(entry);
      if (library.get(id)) throw new LibraryError(message("library.duplicateRelease"), 409);
      checkCapacity(entry.size);
      catalog.games.push(entry);
      catalogSchema.parse(catalog);
      const asset = await open(temporary, "r+");
      try {
        await asset.chmod(0o600);
        await asset.sync();
      } finally {
        await asset.close();
      }
      try {
        await link(temporary, join(directory, entry.file));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const existing = await fingerprint(join(directory, entry.file));
        if (existing.sha256 !== entry.sha256 || existing.size !== entry.size)
          throw new Error("Existing game asset failed integrity verification");
      }
      await syncDirectory(directory);
      await writeCatalog(directory, catalog);
      return id;
    } finally {
      await rm(temporary, { force: true });
    }
  });
}
