import { Readable } from "node:stream";
import { crc32 } from "node:zlib";
import { type Entry, openPromise, type ZipFile } from "yauzl";
import { assertArtifactName } from "../domain/artifacts.ts";
import { message } from "../shared/messages.ts";
import { LibraryError } from "./upload-settings.ts";

/** Inspect portable paths and expanded sizes before opening any member stream. */
export async function openGameArchive(source: string, limits: { files: number; expanded: number }) {
  const archive = await openPromise(source, {
    lazyEntries: true,
    autoClose: false,
    strictFileNames: true,
  }).catch(() => {
    throw new LibraryError(message("library.unreadableZip"));
  });
  try {
    if (archive.entryCount > limits.files) throw new LibraryError(message("library.tooManyFiles"));
    const entries = new Map<string, Entry>();
    const directories = new Set<string>();
    let expanded = 0;
    for await (const entry of archive.eachEntry()) {
      const directory = entry.fileName.endsWith("/");
      const name = directory ? entry.fileName.slice(0, -1) : entry.fileName;
      assertArtifactName(name);
      const key = name.normalize("NFC").toLowerCase();
      const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
      if (entry.isEncrypted() || (mode && mode !== (directory ? 0o040000 : 0o100000)))
        throw new LibraryError(message("library.specialFiles"));
      if (key === "__runtime" || key.startsWith("__runtime/"))
        throw new LibraryError(message("library.reservedPath"));
      if (entries.has(key) || directories.has(key))
        throw new LibraryError(message("library.duplicatePaths"));
      if (directory) directories.add(key);
      else entries.set(key, entry);
      expanded += entry.uncompressedSize;
      if (expanded > limits.expanded)
        throw new LibraryError(
          message("library.expandedSize", { maximum: limits.expanded / 1024 ** 2 }),
        );
    }
    for (const key of [...entries.keys(), ...directories]) {
      const parts = key.split("/");
      while (parts.pop() && parts.length)
        if (entries.has(parts.join("/"))) throw new LibraryError(message("library.pathCollision"));
    }
    return { archive, entries };
  } catch (error) {
    archive.close();
    if (error instanceof LibraryError) throw error;
    throw new LibraryError(message("library.invalidZip"));
  }
}

/** Enforce both declared length and CRC while streaming; never buffer disc tracks. */
export function verifiedEntry(archive: ZipFile, entry: Entry): Readable {
  return Readable.from(
    (async function* () {
      const stream = await archive.openReadStreamPromise(entry);
      let checksum = 0;
      let size = 0;
      for await (const chunk of stream) {
        size += chunk.length;
        if (size > entry.uncompressedSize)
          throw new LibraryError(message("library.archiveSizeMismatch"));
        checksum = crc32(chunk, checksum);
        yield chunk;
      }
      if (size !== entry.uncompressedSize || checksum !== entry.crc32)
        throw new LibraryError(message("library.archiveIntegrity"));
    })(),
  );
}
