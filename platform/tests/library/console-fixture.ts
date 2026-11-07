import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gbaFixture, gbFixture } from "./handheld-fixtures.ts";
import { nesFixture } from "./nes-fixture.ts";
import { snesFixture } from "./snes-fixture.ts";

export async function seedConsoles(dataDirectory: string) {
  const directory = join(dataDirectory, "library");
  const path = join(directory, "catalog.json");
  const catalog = JSON.parse(await readFile(path, "utf8"));
  for (const [system, fixture] of Object.entries({
    nes: nesFixture,
    snes: snesFixture,
    gb: gbFixture,
    gba: gbaFixture,
  })) {
    const bytes = fixture();
    const entry = {
      title: `${system.toUpperCase()} runtime test`,
      system,
      file: `${system}.fixture`,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    await writeFile(join(directory, entry.file), bytes);
    catalog.games.push(entry);
  }
  await writeFile(path, JSON.stringify(catalog));
}
