import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nesFixture } from "./nes-fixture.ts";

export async function seedConsoles(dataDirectory: string) {
  const directory = join(dataDirectory, "library");
  const path = join(directory, "catalog.json");
  const catalog = JSON.parse(await readFile(path, "utf8"));
  const bytes = nesFixture();
  const entry = {
    title: "NES runtime test",
    system: "nes",
    file: "nes.fixture",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  await writeFile(join(directory, entry.file), bytes);
  catalog.games.push(entry);
  await writeFile(path, JSON.stringify(catalog));
}
