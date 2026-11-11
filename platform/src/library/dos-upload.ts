import { once } from "node:events";
import { createWriteStream } from "node:fs";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ZipFile } from "yazl";
import { message } from "../shared/messages.ts";
import { openGameArchive, verifiedEntry } from "./archive.ts";
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
  const { archive, entries } = await openGameArchive(source, gameUploadLimits);
  let active: Readable | undefined;
  try {
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
          active = verifiedEntry(archive, entry);
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
