import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { crc32 } from "node:zlib";
import { type Entry, openPromise } from "yauzl";
import { ZipFile } from "yazl";
import { assertArtifactName } from "../domain/artifacts.ts";
import { message } from "../shared/messages.ts";
import {
  dosConfiguration,
  type GameUploadSettings,
  gameUploadLimits,
  LibraryError,
} from "./upload-settings.ts";

/** Repackage streams without extracting to server paths or buffering expanded files. */
export async function prepareDosUpload(
  source: string,
  destination: string,
  settings: GameUploadSettings,
) {
  const archive = await openPromise(source, {
    lazyEntries: true,
    autoClose: false,
    strictFileNames: true,
  }).catch(() => {
    throw new LibraryError(message("library.unreadableZip"));
  });
  let active: Readable | undefined;
  try {
    if (archive.entryCount > gameUploadLimits.files)
      throw new LibraryError(message("library.tooManyFiles"));
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
      if (expanded > gameUploadLimits.expanded)
        throw new LibraryError(message("library.expandedSizeLegacy"));
    }
    for (const key of [...entries.keys(), ...directories]) {
      const parts = key.split("/");
      while (parts.pop() && parts.length)
        if (entries.has(parts.join("/"))) throw new LibraryError(message("library.pathCollision"));
    }
    const saves = new Set(settings.saveFiles.map((name) => name.normalize("NFC").toLowerCase()));
    const launch = settings.executable.toLowerCase();
    if (!entries.has(launch) || saves.has(launch))
      throw new LibraryError(message("library.executableMissing"));
    const output = new ZipFile();
    const target = createWriteStream(destination, { flags: "wx", mode: 0o600 });
    output.on("error", (error: Error) => target.destroy(error));
    const options = { mtime: new Date(1980, 0, 1), mode: 0o100600, forceDosTimestamp: true };
    const removed: string[] = [];
    for (const [key, entry] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (saves.has(key)) {
        removed.push(entry.fileName);
        continue;
      }
      if (key === ".jsdos" || key.startsWith(".jsdos/")) continue;
      output.addReadStreamLazy(
        entry.fileName,
        { ...options, size: entry.uncompressedSize },
        (callback) => {
          active = Readable.from(
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
          active.on("error", (error) => target.destroy(error));
          callback(null, active);
        },
      );
    }
    output.addBuffer(Buffer.from(dosConfiguration(settings)), ".jsdos/dosbox.conf", options);
    // Sync rules are part of the immutable release, so changing them cannot reuse old progress.
    output.addBuffer(
      Buffer.from(JSON.stringify({ saveFiles: [...saves].sort() })),
      ".jsdos/sync.json",
      options,
    );
    const writing = pipeline(output.outputStream, target);
    output.end();
    await writing;
    return removed;
  } catch (error) {
    if (
      error instanceof LibraryError ||
      /^[A-Z]+$/.test((error as NodeJS.ErrnoException).code ?? "")
    )
      throw error;
    throw new LibraryError(message("library.invalidZip"));
  } finally {
    active?.destroy();
    const closed = once(archive, "close");
    archive.close();
    await closed;
  }
}
