import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

// Test the one reviewed false-positive exception without storing a credential.
const executable = process.env.GITLEAKS_BIN ?? "gitleaks";
const directory = await mkdtemp(join(tmpdir(), "retro-secret-policy-"));
try {
  execFileSync("git", ["init", "--quiet", directory]);
  const paths = ["platform/tests/editors/adapter.test.ts", "scripts/check-secret-scan.mjs"];
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
  for (const file of files) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, field);
  }
  assert.equal(scan(), 0, "The known editor field must remain allowed");
  for (const file of files) {
    await writeFile(
      file,
      `${field}const api_key = ${JSON.stringify(randomBytes(32).toString("hex"))};\n`,
    );
    assert.equal(scan(), 1, "Other secret-like values in either file must still be detected");
    await writeFile(file, field);
  }
  console.log("Secret scan exception is limited to the known editor field.");
} finally {
  // mkdtemp supplies a dedicated absolute child of the OS temporary directory.
  await rm(directory, { recursive: true, force: true });
}
