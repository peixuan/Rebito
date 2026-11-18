import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { browserNotices, packageNotice } from "./browser-notices.ts";

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

it("inventories the exact packages included in emitted browser chunks", async () => {
  const dependency = join(directory, "node_modules", "@fixture", "browser");
  await mkdir(dependency, { recursive: true });
  await writeFile(
    join(dependency, "package.json"),
    JSON.stringify({ name: "@fixture/browser", version: "2.3.4" }),
  );
  await writeFile(join(dependency, "LICENSE"), "Fixture license");
  const outputs = [];
  await browserNotices().generateBundle.call(
    { emitFile: (value) => outputs.push(value) },
    {},
    {
      "app.js": { type: "chunk", modules: { [join(dependency, "index.js")]: {} } },
      "asset.css": { type: "asset" },
    },
  );
  const inventory = outputs.find((item) => item.fileName === "BROWSER_DEPENDENCIES.json");
  expect(JSON.parse(inventory.source)).toEqual({
    version: 1,
    packages: [{ name: "@fixture/browser", version: "2.3.4" }],
  });
});
