import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { c } from "tar";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installRuntime, verifyArchive } from "./runtime-assets.mjs";

let directory;
let archive;
let record;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "retro-runtime-"));
  await mkdir(join(directory, "package", "dist"), { recursive: true });
  await writeFile(join(directory, "package", "dist", "player.js"), "fixture bytes");
  await writeFile(join(directory, "package", "LICENSE"), "fixture notice");
  await writeFile(join(directory, "package", "package.json"), "{}");
  await mkdir(join(directory, "outside"));
  await symlink(join(directory, "outside"), join(directory, "package", "dist", "link"), "junction");
  await c({ file: join(directory, "fixture.tgz"), cwd: directory, gzip: true }, ["package"]);
  archive = await readFile(join(directory, "fixture.tgz"));
  record = {
    id: "test",
    from: "dist",
    target: "test",
    url: "https://example.test/runtime.tgz",
    integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
  };
});
afterEach(async () => rm(directory, { recursive: true, force: true }));

it("verifies archives, preserves notices, skips symlinks and reuses a verified cache", async () => {
  const download = vi.fn().mockImplementation(async () => new Response(archive));
  const cache = join(directory, "cache");
  const output = join(directory, "output");
  await installRuntime(record, cache, output, download);
  expect(await readFile(join(output, "test", "player.js"), "utf8")).toBe("fixture bytes");
  expect(await readFile(join(output, "notices", "test", "LICENSE"), "utf8")).toBe("fixture notice");
  await expect(readFile(join(output, "test", "link"))).rejects.toThrow();
  await installRuntime(record, cache, output, download);
  expect(download).toHaveBeenCalledTimes(1);
  await writeFile(join(cache, "test.tgz"), "corrupt cached archive");
  await expect(installRuntime(record, cache, output, download)).rejects.toThrow("integrity");
});

it("rejects corrupt downloads and HTTP errors before extracting files", async () => {
  expect(() => verifyArchive(Buffer.from("wrong"), record.integrity)).toThrow("integrity");
  const cache = join(directory, "cache");
  const output = join(directory, "output");
  await expect(
    installRuntime(record, cache, output, async () => new Response("bad")),
  ).rejects.toThrow("integrity");
  await expect(
    installRuntime(record, cache, output, async () => new Response("missing", { status: 404 })),
  ).rejects.toThrow("404");
  await expect(readFile(join(cache, "test.tgz"))).rejects.toThrow();
});

it("merges cores without overwriting another core's package metadata", async () => {
  await writeFile(join(directory, "package", "test-wasm.data"), "core");
  await mkdir(join(directory, "package", "reports"));
  await writeFile(join(directory, "package", "reports", "test.json"), "{}");
  await c({ file: join(directory, "core.tgz"), cwd: directory, gzip: true }, ["package"]);
  const core = await readFile(join(directory, "core.tgz"));
  record = {
    ...record,
    core: true,
    integrity: `sha512-${createHash("sha512").update(core).digest("base64")}`,
  };
  const output = join(directory, "output");
  await installRuntime(record, join(directory, "cache"), output, async () => new Response(core));
  expect(await readFile(join(output, "test", "test-wasm.data"), "utf8")).toBe("core");
  await expect(readFile(join(output, "test", "package.json"))).rejects.toThrow();
});
