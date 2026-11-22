import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { releaseId } from "../../src/library/catalog.ts";

/** Catalog-only asset for editor tests; never described as a playable game. */
export async function seedEditor(directory: string, editor = "koukai2") {
  const root = join(directory, "library");
  await mkdir(root, { recursive: true });
  const bytes = Buffer.from(`Synthetic catalog asset for ${editor} editor tests`);
  const entry = {
    title: editor === "jinyong" ? "Jinyong editor test" : "Koukai2 editor test",
    system: "dos" as const,
    file: `${editor}.fixture`,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    saveFiles:
      editor === "jinyong"
        ? [1, 2, 3].flatMap((slot) => ["R", "S", "D"].map((kind) => `${kind}${slot}.GRP`))
        : ["KOUKAI2.DAT", "SECOND.DAT"],
    editor,
  };
  await writeFile(join(root, entry.file), bytes);
  let catalog = { version: 1, games: [] as unknown[] };
  try {
    catalog = JSON.parse(await readFile(join(root, "catalog.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  catalog.games.push(entry);
  await writeFile(join(root, "catalog.json"), JSON.stringify(catalog));
  return releaseId(entry);
}
