import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fingerprint, LocalLibrary } from "../../src/library/catalog.ts";
import { importGame } from "../../src/library/importer.ts";

describe("operator game import", () => {
  let directory: string;
  let library: string;
  let source: string;
  const metadata = { title: "Original fixture", system: "nes" };
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "retro-import-"));
    library = join(directory, "library");
    source = join(directory, "source.nes");
    await writeFile(source, "original fixture bytes");
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("copies immutable assets and appends releases without modifying their sources", async () => {
    const original = await readFile(source);
    const id = await importGame(library, source, metadata);
    expect((await LocalLibrary.load(library)).get(id)?.title).toBe(metadata.title);
    const catalog = JSON.parse(await readFile(join(library, "catalog.json"), "utf8"));
    expect(await readFile(join(library, catalog.games[0].file))).toEqual(original);
    expect(await readFile(source)).toEqual(original);
    await writeFile(source, "second fixture");
    await importGame(library, source, { title: "Second fixture", system: "gb" });
    expect((await LocalLibrary.load(library)).list()).toHaveLength(2);
    expect((await readdir(library)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("rejects duplicate releases and concurrent imports without replacing the catalog", async () => {
    await importGame(library, source, metadata);
    const catalog = await readFile(join(library, "catalog.json"));
    await expect(importGame(library, source, metadata)).rejects.toThrow(
      "Game release already exists",
    );
    await writeFile(join(library, ".import.lock"), "");
    await expect(importGame(library, source, metadata)).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(join(library, "catalog.json"))).toEqual(catalog);
    expect(await readFile(join(library, ".import.lock"), "utf8")).toBe("");
  });

  it("validates metadata and file sizes before publication", async () => {
    await expect(importGame(library, source, { ...metadata, file: "../escape" })).rejects.toThrow();
    await expect(importGame(library, directory, metadata)).rejects.toThrow("Expected a game file");
    await writeFile(source, "");
    await expect(importGame(library, source, metadata)).rejects.toThrow("Expected a game file");
    await writeFile(source, "fixture");
    await expect(
      importGame(library, source, { ...metadata, saveFiles: ["save.dat"] }),
    ).rejects.toThrow();
    await expect(readFile(join(library, "catalog.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(library, ".import.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reuses a valid unpublished asset and refuses a corrupt existing asset", async () => {
    await importGame(library, source, metadata);
    await rm(join(library, "catalog.json"));
    await importGame(library, source, metadata);
    await rm(join(library, "catalog.json"));
    const { sha256 } = await fingerprint(source);
    await writeFile(join(library, `${sha256}.asset`), "corrupt");
    await expect(importGame(library, source, metadata)).rejects.toThrow("integrity verification");
    await expect(readFile(join(library, ".import.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves an invalid catalog for operator recovery", async () => {
    await importGame(library, source, metadata);
    await writeFile(join(library, "catalog.json"), "broken");
    await expect(importGame(library, source, metadata)).rejects.toThrow();
    expect(await readFile(join(library, "catalog.json"), "utf8")).toBe("broken");
  });

  it("runs the operator CLI with explicit inputs and rejects missing arguments", async () => {
    const run = promisify(execFile);
    const cli = resolve("src/library/import-game.ts");
    const specification = join(directory, "game.json");
    await writeFile(specification, JSON.stringify(metadata));
    const result = await run(process.execPath, [cli, source, specification], {
      env: { ...process.env, DATA_DIR: directory },
    });
    expect(result.stdout).toMatch(/Imported nes-[a-f0-9]{64}/);
    expect((await LocalLibrary.load(library)).list()).toHaveLength(1);
    await expect(run(process.execPath, [cli])).rejects.toMatchObject({ code: 1 });
  });
});
