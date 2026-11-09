import type { FileHandle } from "node:fs/promises";
import { message } from "../shared/messages.ts";
import { LibraryError } from "./upload-settings.ts";

/** Bound header inspection; reject disc/32X/Pico images and mismatched 8-bit models.
 * Checksums are not enforced: legitimate translations often retain stale checksums.
 * SMD bytes remain unchanged and are deinterleaved by the emulator at runtime.
 */
export async function validateSegaRom(
  file: FileHandle,
  system: "md" | "sms" | "gg",
  extension: string,
) {
  const invalid = () => new LibraryError(message("library.segaHeader"));
  const { size } = await file.stat();
  if (system === "md") {
    const header = Buffer.alloc(512);
    if (extension === ".smd") {
      if (size < 16896 || (size - 512) % 16384) throw invalid();
      const block = Buffer.alloc(16384);
      await file.read(block, 0, block.length, 512);
      for (let index = 0; index < header.length; index++)
        header[index] = block[(index & 1 ? 0 : 8192) + (index >> 1)] ?? 0;
    } else {
      if (size < 512 || size % 2) throw invalid();
      await file.read(header, 0, header.length, 0);
    }
    const model = header.toString("ascii", 0x100, 0x110);
    if (!model.startsWith("SEGA") || /^SEGA\s*(32X|PICO)/.test(model)) throw invalid();
    return;
  }
  for (const offset of [0x7ff0, 0x3ff0, 0x1ff0]) {
    if (size < offset + 16) continue;
    const header = Buffer.alloc(16);
    await file.read(header, 0, 16, offset);
    if (header.toString("ascii", 0, 8) !== "TMR SEGA") continue;
    const region = (header[15] ?? 0) >> 4;
    if ((system === "sms" ? [3, 4] : [5, 6, 7]).includes(region)) return;
    throw invalid();
  }
  throw invalid();
}
