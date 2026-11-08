import { zipSync } from "fflate";
import { expect, it } from "vitest";
import { inspectDosArchive } from "../../client/library-archive.ts";

it("suggests DOS launch paths without inflating their contents", () => {
  const bytes = zipSync(
    {
      "GAME/PLAY.BAT": Uint8Array.of(1),
      "README.TXT": Uint8Array.of(2),
      "GAME/": new Uint8Array(),
    },
    { level: 0 },
  );
  // Corrupt only a payload byte: listing metadata must still work; the server rejects its CRC.
  bytes[30 + "GAME/PLAY.BAT".length] = 255;
  expect(inspectDosArchive(bytes)).toEqual({
    files: ["GAME/PLAY.BAT", "README.TXT"],
    executables: ["GAME/PLAY.BAT"],
  });
});

it("rejects malformed, oversized and unsafe archive metadata", () => {
  expect(() => inspectDosArchive(Uint8Array.of(1))).toThrow();
  expect(() => inspectDosArchive(new Uint8Array(64 * 1024 ** 2 + 1))).toThrow(
    "library.previewSize",
  );
  expect(() => inspectDosArchive(zipSync({ "../outside": Uint8Array.of(1) }))).toThrow();
  const bytes = Buffer.from(zipSync({ "PLAY.BAT": Uint8Array.of(1) }));
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 1, 2]));
  bytes.writeUInt32LE(257 * 1024 ** 2, central + 24);
  expect(() => inspectDosArchive(bytes)).toThrow("library.previewExpandedSize");
});
