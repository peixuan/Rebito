import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, expect, it } from "vitest";
import { prepareDosUpload } from "../../src/library/dos-upload.ts";
import { gameUploadSchema, LibraryError } from "../../src/library/upload-settings.ts";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "game-upload-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const settings = gameUploadSchema.parse({
  title: "Fixture",
  system: "dos",
  executable: "GAME/PLAY.BAT",
  saveFiles: ["GAME/SAVE.DAT", "GAME/slots/index.dat"],
});
function archive(files: Record<string, Uint8Array> = {}) {
  return Buffer.from(zipSync({ "GAME/PLAY.BAT": Buffer.from("echo READY"), ...files }));
}
async function prepare(bytes: Uint8Array) {
  const source = join(directory, "source.zip");
  const target = join(directory, "output.jsdos");
  await writeFile(source, bytes);
  const removed = await prepareDosUpload(source, target, settings);
  return { removed, bytes: await readFile(target), source };
}

it("streams a deterministic bundle, replaces startup settings and excludes declared personal saves", async () => {
  const input = archive({
    "GAME/SAVE.DAT": Buffer.from("private"),
    "GAME/slots/index.dat": Buffer.from("private index"),
    "GAME/DATA.BIN": Uint8Array.of(0, 255),
    ".jsdos/dosbox.conf": Buffer.from("old config"),
  });
  const result = await prepare(input);
  expect(result.removed.sort()).toEqual(["GAME/SAVE.DAT", "GAME/slots/index.dat"].sort());
  expect(await readFile(result.source)).toEqual(input);
  const files = unzipSync(result.bytes);
  expect(files["GAME/DATA.BIN"]).toEqual(Uint8Array.of(0, 255));
  expect(files["GAME/SAVE.DAT"]).toBeUndefined();
  expect(new TextDecoder().decode(files[".jsdos/dosbox.conf"])).toContain("cd GAME\r\nPLAY.BAT");
  const second = join(directory, "second.jsdos");
  await prepareDosUpload(result.source, second, settings);
  expect(await readFile(second)).toEqual(result.bytes);
  const changed = join(directory, "changed.jsdos");
  await prepareDosUpload(result.source, changed, { ...settings, saveFiles: ["GAME/SAVE.DAT"] });
  expect(await readFile(changed)).not.toEqual(result.bytes);
});

it.each([
  "../outside",
  "C:/outside",
  "bad\\name",
  "__runtime/state",
  "con.txt",
  "GAME/play.bat",
  "GAME",
  "GAME/PLAY.BAT/child",
])("rejects unsafe or colliding ZIP path %s", async (name) => {
  await expect(prepare(archive({ [name]: Uint8Array.of(1) }))).rejects.toBeInstanceOf(LibraryError);
});

it.each(["link", "encrypted", "oversized", "crc", "truncated"])(
  "rejects %s archives without publishing",
  async (kind) => {
    let bytes = archive();
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 1, 2]));
    if (kind === "link") bytes.writeUInt32LE((0o120777 * 65536) >>> 0, central + 38);
    if (kind === "encrypted") bytes.writeUInt16LE(1, central + 8);
    if (kind === "oversized") bytes.writeUInt32LE(257 * 1024 ** 2, central + 24);
    if (kind === "crc") bytes.writeUInt32LE(0, central + 16);
    if (kind === "truncated") bytes = bytes.subarray(0, 20);
    await expect(prepare(bytes)).rejects.toBeInstanceOf(LibraryError);
  },
);

it("rejects missing launch files, excessive entry counts and write failures", async () => {
  await expect(prepare(zipSync({ "README.TXT": Uint8Array.of(1) }))).rejects.toThrow(
    "library.executableMissing",
  );
  await expect(
    prepare(
      archive(
        Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`f${i}`, new Uint8Array()])),
      ),
    ),
  ).rejects.toThrow("library.tooManyFiles");
  await writeFile(join(directory, "output.jsdos"), "existing");
  await expect(prepare(archive())).rejects.toMatchObject({ code: "EEXIST" });
  expect(await readFile(join(directory, "output.jsdos"), "utf8")).toBe("existing");
});

it.each([
  { executable: "../PLAY.BAT" },
  { executable: "PLAY.BAT & exit" },
  { arguments: "| del *" },
  { cycles: "0" },
  { cycles: "1000000" },
  { saveFiles: ["SAVE", "save/slot"] },
  { saveFiles: ["SAVE.DAT", "save.dat"] },
  { system: "nes" },
  { editor: "koukai2" },
])("rejects invalid upload configuration %j", (change) => {
  expect(gameUploadSchema.safeParse({ ...settings, ...change }).success).toBe(false);
});

it("allows console uploads without DOS-only configuration", () => {
  expect(gameUploadSchema.parse({ title: "Console", system: "gba" }).saveFiles).toEqual([]);
});
