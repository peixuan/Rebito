import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { bindGameData } from "../../src/editors/game-data.ts";
import { phantasyStar4Adapter } from "../../src/editors/phantasy-star4/adapter.ts";
import type { EditorRegistration } from "../../src/editors/registry.ts";
import { type Game, LocalLibrary } from "../../src/library/catalog.ts";

const bytes = Buffer.from("Original synthetic game data");
let directory: string;
let library: LocalLibrary;
let game: Game;
const bind = vi.fn(() => phantasyStar4Adapter);
const registration: EditorRegistration = {
  label: "Fixture",
  instructions: "Fixture",
  system: "md",
  snapshot: { core: "genesis_plus_gx", domain: "main" },
  adapter: phantasyStar4Adapter,
  gameData: { maxBytes: 128, bind },
};

beforeEach(async () => {
  bind.mockClear();
  directory = await mkdtemp(join(tmpdir(), "rebito-editor-data-"));
  await writeFile(join(directory, "fixture.bin"), bytes);
  await writeFile(
    join(directory, "catalog.json"),
    JSON.stringify({
      version: 1,
      games: [
        {
          title: "Fixture",
          system: "md",
          file: "fixture.bin",
          size: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      ],
    }),
  );
  library = await LocalLibrary.load(directory);
  const entry = library.list()[0];
  if (!entry) throw new Error("Missing fixture game");
  game = entry;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

it("binds verified immutable bytes and closes the stream before returning", async () => {
  const stream = vi.spyOn(library, "stream");
  expect(await bindGameData(library, game, registration)).toBe(phantasyStar4Adapter);
  expect(bind).toHaveBeenCalledExactlyOnceWith(bytes);
  expect(stream).toHaveBeenCalledExactlyOnceWith(game.id);
  expect(stream.mock.results[0]?.value.destroyed).toBe(true);
});

it("keeps the basic adapter for an absent or oversized optional data binding", async () => {
  const stream = vi.spyOn(library, "stream");
  const { gameData: _, ...basic } = registration;
  expect(await bindGameData(library, game, basic)).toBe(phantasyStar4Adapter);
  expect(await bindGameData(library, { ...game, size: 129 }, registration)).toBe(
    phantasyStar4Adapter,
  );
  expect(stream).not.toHaveBeenCalled();
  expect(bind).not.toHaveBeenCalled();
});

it("rejects missing, truncated, enlarged and changed release data before binding", async () => {
  await expect(bindGameData(library, { ...game, id: "missing" }, registration)).rejects.toThrow();
  for (const invalid of [bytes.subarray(1), Buffer.alloc(129), Buffer.alloc(bytes.length)]) {
    await writeFile(join(directory, "fixture.bin"), invalid);
    await expect(bindGameData(library, game, registration)).rejects.toMatchObject({
      code: "unsupported_editor",
    });
  }
  expect(bind).not.toHaveBeenCalled();
});

it("closes the stream when a game-specific parser rejects its data", async () => {
  const stream = vi.spyOn(library, "stream");
  bind.mockImplementationOnce(() => {
    throw new Error("Rejected fixture");
  });
  await expect(bindGameData(library, game, registration)).rejects.toThrow("Rejected fixture");
  expect(stream.mock.results[0]?.value.destroyed).toBe(true);
});
