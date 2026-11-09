import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, expect, it } from "vitest";
import { LocalLibrary } from "../../src/library/catalog.ts";
import { changeConfiguration, describeConfiguration } from "../../src/library/configuration.ts";
import { importGame } from "../../src/library/importer.ts";

let directory: string;
let id: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "game-configuration-"));
  const file = join(directory, "source.zip");
  await writeFile(
    file,
    zipSync({
      "PLAY.BAT": Buffer.from("echo READY"),
      "RESOURCE.BIN": Uint8Array.of(1, 2, 255),
      ".jsdos/dosbox.conf": Buffer.from(
        "[cpu]\ncycles=auto\n[autoexec]\nmount c .\nc:\nPLAY.BAT\n",
      ),
    }),
  );
  id = await importGame(directory, file, {
    title: "Original",
    system: "dos",
    saveFiles: ["SAVE.DAT"],
    editor: "koukai2",
  });
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("renames in place without changing the release, bytes or verified editor", async () => {
  const detail = await describeConfiguration(directory, id);
  expect(detail.executables).toEqual(["PLAY.BAT"]);
  expect(detail.settings).toMatchObject({ executable: "PLAY.BAT", cycles: "auto" });
  const updated = await changeConfiguration(
    directory,
    id,
    { token: detail.token, title: "Renamed" },
    1e9,
    0,
  );
  expect(updated).toBe(id);
  expect((await LocalLibrary.load(directory)).get(id)).toMatchObject({
    title: "Renamed",
    editor: "koukai2",
  });
  await expect(
    changeConfiguration(directory, id, { token: detail.token, title: "Stale" }, 1e9, 0),
  ).rejects.toMatchObject({ statusCode: 409 });
});

it("reuses server bytes for new launch/sync settings and preserves the original release", async () => {
  const detail = await describeConfiguration(directory, id);
  const launch = {
    executable: "PLAY.BAT",
    arguments: "",
    cycles: "4000",
    saveFiles: ["SAVE.DAT", "slots/INDEX.DAT"],
  };
  const created = await changeConfiguration(
    directory,
    id,
    { token: detail.token, title: "Adjusted", launch },
    1e9,
    0,
  );
  expect(created).not.toBe(id);
  const library = await LocalLibrary.load(directory);
  expect(library.get(id)?.editor).toBe("koukai2");
  expect(library.get(created)?.editor).toBeUndefined();
  const asset = unzipSync(await readFile(join(directory, `${library.get(created)?.sha256}.asset`)));
  expect(asset["RESOURCE.BIN"]).toEqual(Uint8Array.of(1, 2, 255));
  expect(Buffer.from(asset[".jsdos/dosbox.conf"] ?? []).toString()).toContain("cycles=4000");
  const next = await describeConfiguration(directory, created);
  expect(
    await changeConfiguration(
      directory,
      created,
      { token: next.token, title: "Adjusted", launch },
      1e9,
      0,
    ),
  ).toBe(created);
  expect(await readdir(join(directory, ".uploads"))).toEqual([]);
});

it("rejects malformed/stale launches, missing programs, quotas and reserved editor overrides", async () => {
  const { token } = await describeConfiguration(directory, id);
  for (const input of [
    { token, title: "Bad", editor: "koukai2" },
    { token, title: "Bad", launch: { executable: "MISSING.EXE" } },
    { token, title: "Bad", launch: { executable: "../PLAY.BAT" } },
  ])
    await expect(changeConfiguration(directory, id, input, 1e9, 0)).rejects.toThrow();
  const input = { token, title: "No space", launch: { executable: "PLAY.BAT", cycles: "max" } };
  await expect(changeConfiguration(directory, id, input, 1, 0)).rejects.toMatchObject({
    statusCode: 507,
  });
  expect((await LocalLibrary.load(directory)).list()).toHaveLength(1);
  expect(await readdir(join(directory, ".uploads"))).toEqual([]);
  await expect(describeConfiguration(directory, "missing")).rejects.toMatchObject({
    statusCode: 404,
  });
});
