import { createHash } from "node:crypto";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ZipFile as Archive, Entry } from "yauzl";
import { ZipFile } from "yazl";
import { discUploadLimits } from "../domain/game-import.ts";
import { message } from "../shared/messages.ts";
import { openGameArchive, verifiedEntry } from "./archive.ts";
import { parseDiscCue } from "./segacd-cue.ts";
import { LibraryError } from "./upload-settings.ts";

export function validateDiscBios(bytes: Buffer) {
  const region = bytes.subarray(0x1f0, 0x200).toString("ascii").trim();
  if (
    bytes.length !== 131072 ||
    bytes.subarray(0x100, 0x110).toString("ascii").trim() !== "SEGA MEGA DRIVE" ||
    !/^[JUE]$/.test(region)
  )
    throw new LibraryError(message("library.biosFormat"));
  return { region, name: `bios_CD_${region}.bin` };
}

async function smallEntry(archive: Archive, entry: Entry, maximum: number) {
  if (entry.uncompressedSize > maximum) throw new LibraryError(message("library.cueSize"));
  const chunks: Buffer[] = [];
  for await (const chunk of verifiedEntry(archive, entry)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function inspectDiscFirmware(source: string) {
  const { archive, entries } = await openGameArchive(source, discUploadLimits);
  try {
    const bios = [...entries.values()].filter((entry) =>
      /^bios_CD_[JUE]\.bin$/.test(entry.fileName),
    );
    if (bios.length !== 1 || !bios[0]) throw new LibraryError(message("library.biosMissing"));
    const bytes = await smallEntry(archive, bios[0], 131072);
    return { ...validateDiscBios(bytes), sha256: createHash("sha256").update(bytes).digest("hex") };
  } finally {
    archive.close();
  }
}

/** Repackage one disc and one region BIOS; unrelated files and bundled saves are excluded. */
export async function prepareDiscUpload(source: string, destination: string, bios: Buffer) {
  const firmware = validateDiscBios(bios);
  const { archive, entries } = await openGameArchive(source, discUploadLimits);
  let active: Readable | undefined;
  try {
    const cues = [...entries.values()].filter((entry) => /\.cue$/i.test(entry.fileName));
    if (cues.length !== 1 || !cues[0]) throw new LibraryError(message("library.singleCue"));
    const cue = cues[0];
    const disc = parseDiscCue(
      (await smallEntry(archive, cue, 65536)).toString("utf8"),
      cue.fileName,
      entries,
    );
    if (
      disc.files.reduce(
        (sum, file) => sum + file.entry.uncompressedSize,
        bios.length + Buffer.byteLength(disc.text),
      ) > discUploadLimits.expanded
    )
      throw new LibraryError(message("library.discSize"));
    const first = disc.files[0];
    if (!first) throw new LibraryError(message("library.dataTrackMissing"));
    const stream = verifiedEntry(archive, first.entry);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      chunks.push(chunk);
      size += chunk.length;
      if (size >= 540) break;
    }
    const header = Buffer.concat(chunks).subarray(first.sector === 2352 ? 16 : 0);
    if (header.subarray(0, 14).toString("ascii") !== "SEGADISCSYSTEM")
      throw new LibraryError(message("library.discFormat"));
    const region = header.subarray(0x1f0, 0x200).toString("ascii").trim();
    const bootRegion = header[0x20b] === 0xa1 ? "J" : header[0x20b] === 0x64 ? "E" : "U";
    if (
      !/^[JUE]+$/.test(region) ||
      !region.includes(firmware.region) ||
      bootRegion !== firmware.region
    )
      throw new LibraryError(message("library.discRegion"));
    const output = new ZipFile();
    const target = createWriteStream(destination, { flags: "wx", mode: 0o600 });
    output.on("error", (error: Error) => target.destroy(error));
    const options = { mtime: new Date(1980, 0, 1), mode: 0o100600, forceDosTimestamp: true };
    // CUE must precede .bin firmware: the pinned wrapper chooses the first valid content file.
    output.addBuffer(Buffer.from(disc.text), "disc.cue", options);
    for (const file of disc.files) {
      output.addReadStreamLazy(
        file.name,
        { ...options, size: file.entry.uncompressedSize },
        (callback) => {
          active = verifiedEntry(archive, file.entry);
          active.on("error", (error) => target.destroy(error));
          callback(null, active);
        },
      );
    }
    output.addBuffer(bios, firmware.name, options);
    const writing = pipeline(output.outputStream, target);
    output.end();
    await writing;
    return firmware;
  } catch (error) {
    if (
      error instanceof LibraryError ||
      /^[A-Z]+$/.test((error as NodeJS.ErrnoException).code ?? "")
    )
      throw error;
    throw new LibraryError(message("library.discZip"));
  } finally {
    active?.destroy();
    const closed = once(archive, "close");
    archive.close();
    await closed;
  }
}
