import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, expect, it } from "vitest";
import { bundleDos } from "./bundle-dos.mjs";

let root;
let source;
let specification;
let output;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "retro-bundle-"));
  source = join(root, "source");
  specification = join(root, "specification.json");
  output = join(root, "game.jsdos");
  await mkdir(source);
  await writeFile(join(root, "dosbox.conf"), "[autoexec]\nmount c .\nc:\nplay.bat\n");
  await writeFile(join(source, "play.bat"), "@echo hello");
  await writeFile(join(source, "private.sav"), "must not be bundled");
  await setFiles(["play.bat"]);
});
afterEach(async () => rm(root, { recursive: true, force: true }));
async function setFiles(files) {
  await writeFile(specification, JSON.stringify({ configuration: "dosbox.conf", files }));
}

it("packages only allowed files reproducibly and never overwrites output or sources", async () => {
  await bundleDos(source, specification, output);
  const first = await readFile(output);
  expect(Object.keys(unzipSync(first)).sort()).toEqual([".jsdos/dosbox.conf", "play.bat"]);
  expect(Buffer.from(unzipSync(first)["play.bat"]).toString()).toBe("@echo hello");
  await bundleDos(source, specification, join(root, "second.jsdos"));
  expect(await readFile(join(root, "second.jsdos"))).toEqual(first);
  await expect(bundleDos(source, specification, output)).rejects.toMatchObject({ code: "EEXIST" });
  await expect(bundleDos(source, specification, join(source, "output.jsdos"))).rejects.toThrow(
    "outside",
  );
  expect(await readFile(join(source, "private.sav"), "utf8")).toBe("must not be bundled");
});

it("rejects escapes, duplicate names, reserved configuration and directory collisions", async () => {
  for (const files of [
    ["../dosbox.conf"],
    ["play.bat", "PLAY.BAT"],
    [".jsdos/dosbox.conf"],
    ["play.bat", "play.bat/child"],
  ]) {
    await setFiles(files);
    await expect(bundleDos(source, specification, output)).rejects.toThrow();
  }
  await mkdir(join(root, "outside"));
  await writeFile(join(root, "outside", "file"), "private");
  await symlink(join(root, "outside"), join(source, "link"), "junction");
  await setFiles(["link/file"]);
  await expect(bundleDos(source, specification, output)).rejects.toThrow("escapes");
  await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
});

it("requires a bounded startup configuration and ordinary source files", async () => {
  await writeFile(join(root, "dosbox.conf"), "invalid");
  await expect(bundleDos(source, specification, output)).rejects.toThrow("[autoexec]");
  await writeFile(join(root, "dosbox.conf"), "x".repeat(32769));
  await expect(bundleDos(source, specification, output)).rejects.toThrow("32 KiB");
  await writeFile(join(root, "dosbox.conf"), "[autoexec]\n");
  await mkdir(join(source, "folder"));
  await setFiles(["folder"]);
  await expect(bundleDos(source, specification, output)).rejects.toThrow("limits");
});
