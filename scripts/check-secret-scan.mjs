import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

// Test the exact reviewed false positives without storing a credential.
const executable = process.env.GITLEAKS_BIN ?? "gitleaks";
const directory = await mkdtemp(join(tmpdir(), "retro-secret-policy-"));
try {
  execFileSync("git", ["init", "--quiet", directory]);
  const catalogPaths = ["shared", "en"].map(
    (locale) => `platform/client/locales/${locale}/editors/phantasyStar4Names.json`,
  );
  const paths = [
    "platform/tests/editors/adapter.test.ts",
    "scripts/check-secret-scan.mjs",
    ...catalogPaths,
  ];
  const files = paths.map((path) => join(directory, path));
  const scan = () => {
    execFileSync("git", ["add", ...paths], { cwd: directory });
    const result = spawnSync(
      executable,
      [
        "git",
        directory,
        "--pre-commit",
        "--staged",
        "--config",
        resolve(".gitleaks.toml"),
        "--redact=100",
        "--no-banner",
        "--exit-code=1",
      ],
      { encoding: "utf8" },
    );
    if (result.error) throw result.error;
    return result.status;
  };
  const field = 'const preview = { key: "companion.0.salary" };\n';
  const catalog = JSON.stringify(
    {
      "phantasyStar4.items.133": "Escapipe",
      "phantasyStar4.items.134": "Sole Dew",
      "phantasyStar4.items.153": "Control Key",
      "phantasyStar4.items.154": "Canceller",
    },
    null,
    2,
  );
  const contents = [field, field, catalog, catalog];
  for (const file of files) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, contents[files.indexOf(file)]);
  }
  assert.equal(scan(), 0, "The known editor field and exact item identifiers must remain allowed");
  for (const file of files) {
    const content = contents[files.indexOf(file)];
    await writeFile(
      file,
      `${content}\nconst api_key = ${JSON.stringify(randomBytes(32).toString("hex"))};\n`,
    );
    assert.equal(scan(), 1, "Other secret-like values in either file must still be detected");
    await writeFile(file, content);
  }
  for (const file of files.slice(2)) {
    await writeFile(file, catalog.replace("items.134", "items.135"));
    assert.equal(scan(), 1, "Other catalog identifiers must not share the exact exception");
    await writeFile(file, catalog);
  }
  await writeFile(files[0], catalog);
  assert.equal(scan(), 1, "Catalog exceptions must not apply outside their catalog path");
  console.log("Secret scan exceptions remain limited to exact fields and paths.");
} finally {
  // mkdtemp supplies a dedicated absolute child of the OS temporary directory.
  await rm(directory, { recursive: true, force: true });
}
