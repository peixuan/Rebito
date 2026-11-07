import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("generates separate private secrets and never overwrites existing configuration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "retro-config-"));
  const script = fileURLToPath(new URL("../../scripts/configure.mjs", import.meta.url));
  try {
    const output = execFileSync(process.execPath, [script], { cwd: directory, encoding: "utf8" });
    const original = await readFile(join(directory, ".env"), "utf8");
    const values = Object.fromEntries(
      original
        .trim()
        .split("\n")
        .map((line) => line.split("=")),
    );
    expect(values.AUTH_SECRET).toMatch(/^[a-f0-9]{64}$/);
    expect(values.POSTGRES_PASSWORD).toMatch(/^[a-f0-9]{64}$/);
    expect(values.DATABASE_PASSWORD).toMatch(/^[a-f0-9]{64}$/);
    expect(values.DATABASE_PASSWORD).not.toBe(values.POSTGRES_PASSWORD);
    expect(values.AUTH_SECRET).not.toBe(values.POSTGRES_PASSWORD);
    expect(output).not.toContain(values.AUTH_SECRET);
    expect(() =>
      execFileSync(process.execPath, [script], { cwd: directory, stdio: "pipe" }),
    ).toThrow();
    expect(await readFile(join(directory, ".env"), "utf8")).toBe(original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
