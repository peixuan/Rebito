import { createHash } from "node:crypto";
import { message } from "../shared/messages.ts";
import type { FirmwareRegion } from "./firmware.ts";
import { validateDiscBios } from "./segacd-upload.ts";
import { LibraryError } from "./upload-settings.ts";

// Known dumps, not a guarantee of game compatibility. Sources: LIBRARY.md#bios-checksums.
const known: Record<FirmwareRegion, readonly string[]> = {
  J: ["278a9397d192149e84e820ac621a8edd", "bdeb4c47da613946d422d97d98b21cda"],
  U: ["2efd74e3232ff260e371b99f84024f7f", "854b9150240a198070150e4566ae1290"],
  E: ["e66fa1dc5820d254611fdcdba0662372"],
};

export function describeBios(bytes: Buffer) {
  const firmware = validateDiscBios(bytes);
  // MD5 identifies established emulator dumps; SHA-256 remains the storage identity.
  const md5 = createHash("md5").update(bytes).digest("hex");
  return { ...firmware, md5, recognized: known[firmware.region].includes(md5) };
}

/** Only an explicit administrator choice can admit a structurally valid unknown dump. */
export function verifyBios(bytes: Buffer, allowUnrecognized = false) {
  const firmware = describeBios(bytes);
  if (!firmware.recognized && !allowUnrecognized)
    throw new LibraryError(
      message("library.biosUnrecognized", {
        md5: firmware.md5,
        region: firmware.region,
      }),
    );
  return bytes;
}
