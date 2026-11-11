import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { zipSync } from "fflate";
import { gbaFixture, gbFixture } from "./handheld-fixtures.ts";
import { nesFixture } from "./nes-fixture.ts";
import { mdFixture, sega8Fixture, smdFixture } from "./sega-fixtures.ts";
import { discBios, discTrack } from "./segacd-fixtures.ts";
import { snesFixture } from "./snes-fixture.ts";

export async function seedConsoles(dataDirectory: string) {
  const directory = join(dataDirectory, "library");
  const path = join(directory, "catalog.json");
  const catalog = JSON.parse(await readFile(path, "utf8"));
  for (const [variant, fixture] of Object.entries({
    segacd: () =>
      zipSync({
        "disc.cue": Buffer.from('FILE "disc.bin" BINARY\nTRACK 01 MODE1/2352\nINDEX 01 00:00:00\n'),
        "disc.bin": discTrack(),
        "bios_CD_J.bin": discBios(),
      }),
    nes: nesFixture,
    snes: snesFixture,
    gb: gbFixture,
    gba: gbaFixture,
    md: mdFixture,
    "md-smd": smdFixture,
    sms: () => sega8Fixture(),
    gg: () => sega8Fixture(true),
  })) {
    const bytes = fixture();
    const entry = {
      title: `${variant.toUpperCase()} runtime test`,
      system: variant === "md-smd" ? "md" : variant,
      file: `${variant}.fixture`,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    await writeFile(join(directory, entry.file), bytes);
    catalog.games.push(entry);
  }
  await writeFile(path, JSON.stringify(catalog));
}
