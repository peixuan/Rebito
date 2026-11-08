import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { editorFixture } from "../editors/fixture.ts";

export function dosEditorSave(money: number): Uint8Array {
  const bytes = editorFixture();
  new DataView(bytes.buffer).setUint32(0x6a1, money, true);
  return bytes;
}

/** DOS shell writes synthetic editor inputs; no game executable is used. */
export async function seedDosEditor(directory: string) {
  const bytes = zipSync({
    ".jsdos/dosbox.conf": strToU8("[cpu]\r\ncycles=3000\r\n[autoexec]\r\nmount c .\r\nc:\r\n"),
    "KOUKAI2.DAT": dosEditorSave(123),
    "slots/SECOND.DAT": dosEditorSave(42),
    "FIRST.DAT": dosEditorSave(123),
    "NEXT.DAT": dosEditorSave(456),
  });
  const root = join(directory, "library");
  const entry = {
    title: "DOS live edit test",
    system: "dos",
    file: "dos-editor.fixture",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    saveFiles: ["KOUKAI2.DAT", "slots/SECOND.DAT"],
    editor: "koukai2",
  };
  const catalogPath = join(root, "catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  catalog.games.push(entry);
  await writeFile(join(root, entry.file), bytes);
  await writeFile(catalogPath, JSON.stringify(catalog));
}
