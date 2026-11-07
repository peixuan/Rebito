import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { catalogSchema, LocalLibrary, releaseId } from "../../src/library/catalog.ts";

describe("verified game library", () => {
  let directory: string;
  const bytes = Buffer.from("synthetic game asset; not a playable ROM");
  const entry = {
    title: "Test",
    system: "nes" as const,
    file: "game.fixture",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "retro-library-"));
    await writeFile(join(directory, entry.file), bytes);
  });
  afterEach(async () => rm(directory, { recursive: true, force: true }));
  async function catalog(games: unknown[]) {
    await writeFile(join(directory, "catalog.json"), JSON.stringify({ version: 1, games }));
  }

  it("starts empty, verifies bytes, hides disk paths and streams the exact asset", async () => {
    expect((await LocalLibrary.load(directory)).list()).toEqual([]);
    await catalog([entry]);
    const library = await LocalLibrary.load(directory);
    const game = library.list()[0];
    expect(game).toMatchObject({ id: releaseId(entry), title: "Test", saveFiles: [] });
    expect(game).not.toHaveProperty("file");
    expect(library.get("absent")).toBeUndefined();
    expect(library.stream("absent")).toBeUndefined();
    const chunks: Buffer[] = [];
    const stream = library.stream(releaseId(entry));
    if (!stream) throw new Error("Expected a verified game stream");
    for await (const chunk of stream) chunks.push(chunk);
    expect(Buffer.concat(chunks)).toEqual(bytes);
    expect(library.get(releaseId(entry))).toEqual(game);
  });

  it("rejects mismatched, missing, duplicate and non-file assets", async () => {
    for (const patch of [{ size: 1 }, { sha256: "0".repeat(64) }, { file: "missing" }]) {
      await catalog([{ ...entry, ...patch }]);
      await expect(LocalLibrary.load(directory)).rejects.toThrow();
    }
    await catalog([entry, entry]);
    await expect(LocalLibrary.load(directory)).rejects.toThrow("Duplicate");
    await mkdir(join(directory, "folder"));
    await catalog([{ ...entry, file: "folder" }]);
    await expect(LocalLibrary.load(directory)).rejects.toThrow("size");
  });

  it("rejects directory symlinks escaping the library", async () => {
    await mkdir(join(directory, "inside"));
    // Junctions work without Windows developer mode; Linux uses a directory symlink.
    await symlink(directory, join(directory, "inside", "escape"), "junction");
    await writeFile(
      join(directory, "inside", "catalog.json"),
      JSON.stringify({
        version: 1,
        games: [{ ...entry, file: "escape/game.fixture" }],
      }),
    );
    await expect(LocalLibrary.load(join(directory, "inside"))).rejects.toThrow("escapes");
  });

  it("fails closed on invalid JSON and unreadable catalogs", async () => {
    await writeFile(join(directory, "catalog.json"), "invalid");
    await expect(LocalLibrary.load(directory)).rejects.toThrow();
    await rm(join(directory, "catalog.json"));
    await mkdir(join(directory, "catalog.json"));
    await expect(LocalLibrary.load(directory)).rejects.toThrow();
  });

  it.each([
    { file: "../outside" },
    { file: "C:/private" },
    { system: "windows" },
    { size: 0 },
    { size: 0.5 },
    { size: 513 * 1024 * 1024 },
    { title: " " },
    { sha256: "bad" },
    { saveFiles: ["SAVE.DAT"] },
    { editor: "koukai2" },
    { system: "dos", saveFiles: ["SAVE.DAT", "save.dat"] },
    { system: "dos", saveFiles: ["__RUNTIME/filesystem.zip"] },
    { system: "dos", saveFiles: ["__runtime"] },
    { system: "dos", saveFiles: ["SAVE", "save/nested.dat"] },
    { system: "dos", saveFiles: Array.from({ length: 128 }, (_, i) => `save${i}.dat`) },
    { extra: true },
  ])("rejects unsupported or ambiguous manifest settings: %j", (patch) => {
    expect(catalogSchema.safeParse({ version: 1, games: [{ ...entry, ...patch }] }).success).toBe(
      false,
    );
  });
  it("reserves room for a filesystem artifact alongside the maximum native files", () => {
    const saveFiles = Array.from({ length: 127 }, (_, i) => `save${i}.dat`);
    expect(
      catalogSchema.parse({ version: 1, games: [{ ...entry, system: "dos", saveFiles }] }).games[0]
        ?.saveFiles,
    ).toHaveLength(127);
  });
});
