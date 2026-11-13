import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { packageNotice } from "./browser-notices.ts";

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "browser-notices-"));
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      name: "fixture",
      version: "1.0.0",
      license: "MIT",
    }),
  );
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
it("preserves full license and additional notice text", async () => {
  await writeFile(join(directory, "LICENSE.md"), "Copyright fixture\nPermission granted.\n");
  await writeFile(join(directory, "NOTICE"), "Additional attribution.\n");
  expect(await packageNotice(directory)).toBe(
    "fixture@1.0.0 (MIT)\nLICENSE.md\nCopyright fixture\nPermission granted.\n\nNOTICE\nAdditional attribution.\n\n",
  );
});
it("fails when a bundled package has no license text", async () => {
  await expect(packageNotice(directory)).rejects.toThrow("Missing browser license notice: fixture");
});
