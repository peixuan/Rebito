import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, expect, it } from "vitest";
import { prepareDiscUpload, validateDiscBios } from "../../src/library/segacd-upload.ts";
import { discArchive, discBios, discCue, discTrack } from "./segacd-fixtures.ts";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "disc-import-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
async function prepare(input = discArchive(), bios = discBios(), name = "output.zip") {
  const source = join(directory, "input.zip");
  const target = join(directory, name);
  await writeFile(source, input);
  await prepareDiscUpload(source, target, bios);
  expect(await readFile(source)).toEqual(Buffer.from(input));
  return readFile(target);
}

it("normalizes case and paths without changing tracks, pregaps or firmware", async () => {
  const cue = `${discCue} TRACK 02 AUDIO\n PREGAP 00:02:00\n INDEX 00 00:00:74\n INDEX 01 00:01:00\n`;
  const input = discArchive(cue, { "private.srm": Buffer.from("private") });
  const bytes = await prepare(input);
  const files = unzipSync(bytes);
  expect(Object.keys(files)).toEqual(["disc.cue", "track-01.bin", "bios_CD_J.bin"]);
  expect(files["track-01.bin"]).toEqual(new Uint8Array(discTrack()));
  expect(files["bios_CD_J.bin"]).toEqual(new Uint8Array(discBios()));
  expect(Buffer.from(files["disc.cue"] ?? []).toString()).toContain('FILE "track-01.bin" BINARY');
  expect(Buffer.from(files["disc.cue"] ?? []).toString()).toContain("PREGAP 00:02:00");
  expect(await prepare(input, discBios(), "second.zip")).toEqual(bytes);
  const changed = discBios();
  changed[0x1000] = 1;
  expect(await prepare(input, changed, "changed.zip")).not.toEqual(bytes);
});

it("supports subdirectories and separate audio files with 2048-byte data", async () => {
  const cue =
    'REM test\nTITLE "Own disc"\nFILE "DATA.BIN" BINARY\nTRACK 01 MODE1/2048\nINDEX 01 00:00:00\nFILE "AUDIO.BIN" BINARY\nTRACK 02 AUDIO\nINDEX 01 00:00:00\n';
  const files = unzipSync(
    await prepare(
      zipSync({
        "folder/disc.cue": Buffer.from(cue),
        "folder/data.bin": discTrack("J", 2048),
        "folder/audio.bin": Buffer.alloc(2352 * 10),
      }),
    ),
  );
  expect(files["track-02.bin"]).toHaveLength(2352 * 10);
});

it.each([
  "",
  discCue.replace("GAME.BIN", "../game.bin"),
  discCue.replace("GAME.BIN", "absent.bin"),
  discCue.replace("BINARY", "WAVE"),
  discCue.replace("01 MODE1", "02 MODE1"),
  discCue.replace("MODE1/2352", "AUDIO"),
  discCue.replace("INDEX 01", "INDEX 00"),
  discCue.replace("00:00:00", "00:00:75"),
  discCue.replace("00:00:00", "00:10:00"),
  `${discCue}INDEX 00 00:00:00`,
  `${discCue}FILE "game.bin" BINARY`,
  `${discCue}BOGUS x`,
  `${discCue}TRACK 02 MODE1/2352\nINDEX 01 00:01:00`,
])("rejects malformed or unsupported CUE %s", async (cue) => {
  await expect(prepare(discArchive(cue))).rejects.toThrow();
});

it("rejects ambiguous, corrupt, oversized and non-CD archives", async () => {
  for (const input of [
    discArchive(discCue, { "second.cue": Buffer.from(discCue) }),
    discArchive(discCue, { "GAME.BIN": discTrack() }),
    discArchive("x".repeat(65537)),
    discArchive(discCue, { "game.bin": Buffer.alloc(2352 * 128) }),
    discArchive(discCue, { "game.bin": Buffer.alloc(23) }),
    discArchive(discCue, { "game.bin": discTrack("U") }),
    zipSync({ "readme.txt": Buffer.from("no disc") }),
  ])
    await expect(prepare(input)).rejects.toThrow();
  const corrupt = Buffer.from(discArchive());
  const central = corrupt.indexOf(Buffer.from([0x50, 0x4b, 1, 2]));
  corrupt.writeUInt32LE(0, central + 16);
  await expect(prepare(corrupt)).rejects.toThrow("library.archiveIntegrity");
});

it("checks BIOS size, header and region rather than trusting a filename", () => {
  for (const region of ["J", "U", "E"])
    expect(validateDiscBios(discBios(region)).region).toBe(region);
  for (const bios of [Buffer.alloc(131072), Buffer.alloc(256), discBios("X"), discBios("JUE")])
    expect(() => validateDiscBios(bios)).toThrow("library.biosFormat");
});
