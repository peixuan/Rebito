import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { releaseId } from "../../src/library/catalog.ts";

/** Catalog/HTTP fixture only: deliberately not a playable emulator test ROM. */
export async function seedLibrary(dataDirectory: string) {
  const bytes = Buffer.from("synthetic library test asset");
  const entry = {
    title: "Test game",
    system: "nes" as const,
    file: "game.fixture",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const directory = join(dataDirectory, "library");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, entry.file), bytes);
  await writeFile(join(directory, "catalog.json"), JSON.stringify({ version: 1, games: [entry] }));
  return { id: releaseId(entry), bytes };
}
