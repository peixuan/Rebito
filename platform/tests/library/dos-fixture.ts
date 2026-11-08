import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";

/** Own DOS batch fixture exercises the real emulator without distributing a game. */
export async function seedDos(dataDirectory: string) {
  const bytes = zipSync({
    ".jsdos/dosbox.conf": strToU8(
      [
        "[sdl]",
        "autolock=false",
        "[dosbox]",
        "memsize=16",
        "[cpu]",
        "cycles=3000",
        "[autoexec]",
        "mount c .",
        "c:",
        "fixture.bat",
        "",
      ].join("\r\n"),
    ),
    "fixture.bat": strToU8(
      "@echo off\r\nif exist SAVE.DAT goto display\r\necho FIRST>SAVE.DAT\r\n:display\r\ntype SAVE.DAT\r\necho RETRO PORTAL DOS TEST\r\n",
    ),
    "verify.bat": strToU8("@copy /y SAVE.DAT CHECK.DAT\r\n"),
  });
  const directory = join(dataDirectory, "library");
  const catalogPath = join(directory, "catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const entry = {
    title: "DOS save test",
    system: "dos",
    file: "dos.fixture",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    saveFiles: ["SAVE.DAT"],
  };
  catalog.games.push(entry);
  await writeFile(join(directory, entry.file), bytes);
  await writeFile(catalogPath, JSON.stringify(catalog));
}
