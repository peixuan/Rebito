import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { z } from "zod";
import { assertArtifactName, progressLimits } from "../domain/artifacts.ts";
import { systemIds } from "../domain/systems.ts";
import { editorIds, findEditor } from "../editors/registry.ts";

const portablePath = z.string().refine((value) => {
  try {
    assertArtifactName(value);
    return true;
  } catch {
    return false;
  }
}, "Expected a portable relative path");

const entrySchema = z
  .strictObject({
    title: z.string().trim().min(1).max(120),
    system: z.enum(systemIds),
    file: portablePath,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size: z
      .number()
      .int()
      .min(1)
      .max(1024 ** 3 + 4 * 1024 ** 2),
    // Reserve one artifact for the DOS filesystem overlay.
    saveFiles: z
      .array(portablePath)
      .max(progressLimits.files - 1)
      .default([]),
    editor: z.enum(editorIds).optional(),
  })
  .superRefine((entry, context) => {
    if (entry.system !== "segacd" && entry.size > 512 * 1024 ** 2)
      context.addIssue({ code: "custom", message: "Game file exceeds system limit" });
    const names = entry.saveFiles.map((name) => name.normalize("NFC").toLowerCase());
    if (new Set(names).size !== names.length) {
      context.addIssue({ code: "custom", message: "Duplicate save paths" });
    }
    if (names.some((name) => name === "__runtime" || name.startsWith("__runtime/"))) {
      context.addIssue({ code: "custom", message: "Reserved runtime save path" });
    }
    if (names.some((name) => names.some((other) => other.startsWith(`${name}/`)))) {
      context.addIssue({ code: "custom", message: "Save path is both a file and directory" });
    }
    if (entry.system !== "dos" && names.length) {
      context.addIssue({ code: "custom", message: "DOS-specific settings on a console game" });
    }
    if (entry.editor && findEditor(entry.editor)?.system !== entry.system)
      context.addIssue({ code: "custom", message: "Editor does not support this game system" });
  });

export type LibraryEntry = z.infer<typeof entrySchema>;
export type Game = Readonly<Omit<LibraryEntry, "file"> & { id: string; cover?: string }>;
export const catalogSchema = z.strictObject({
  version: z.literal(1),
  games: z.array(entrySchema).max(5000),
});

/** Asset bytes, not an editable display name, identify a game release. */
export function releaseId(entry: Pick<LibraryEntry, "system" | "sha256">): string {
  return `${entry.system}-${entry.sha256}`;
}

export async function fingerprint(path: string): Promise<{ sha256: string; size: number }> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { sha256: hash.digest("hex"), size };
}

/** Assets stay immutable; new catalog snapshots replace the complete verified map. */
export class LocalLibrary {
  private entries = new Map<string, { game: Game; path: string }>();
  private directory = "";
  private snapshot = "";
  private pending: Promise<void> = Promise.resolve();

  static async load(directory: string): Promise<LocalLibrary> {
    const library = new LocalLibrary();
    library.directory = directory;
    await library.refresh();
    return library;
  }

  /** Serialize refreshes so a slower older read cannot replace a newer catalog. */
  refresh(): Promise<void> {
    const operation = this.pending.then(() => this.reload());
    this.pending = operation.catch(() => {});
    return operation;
  }

  private async reload(): Promise<void> {
    let json: string;
    try {
      json = await readFile(join(this.directory, "catalog.json"), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && !this.snapshot) return;
      throw error;
    }
    if (json === this.snapshot) return;
    const entries = new Map<string, { game: Game; path: string }>();
    const catalog = catalogSchema.parse(JSON.parse(json));
    const root = await realpath(this.directory);
    for (const entry of catalog.games) {
      const path = await realpath(join(root, entry.file));
      const child = relative(root, path);
      if (!child || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
        throw new Error("Game asset escapes the library directory");
      }
      const details = await stat(path);
      if (!details.isFile() || details.size !== entry.size)
        throw new Error("Game asset size mismatch");
      const actual = await fingerprint(path);
      if (actual.sha256 !== entry.sha256) throw new Error("Game asset checksum mismatch");
      const id = releaseId(entry);
      if (entries.has(id)) throw new Error("Duplicate game release");
      const { file: _, ...publicEntry } = entry;
      entries.set(id, { game: Object.freeze({ ...publicEntry, id }), path });
    }
    this.entries = entries;
    this.snapshot = json;
  }

  list(): readonly Game[] {
    return [...this.entries.values()].map(({ game }) => game);
  }

  get(id: string): Game | undefined {
    return this.entries.get(id)?.game;
  }

  stream(id: string) {
    const entry = this.entries.get(id);
    return entry ? createReadStream(entry.path) : undefined;
  }
}
