import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { registerWeb } from "../../src/server/web.ts";

it("serves built HTML without exposing dotfiles or replacing unknown API routes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "retro-web-"));
  const app = createApp();
  try {
    await writeFile(join(directory, "index.html"), "<!doctype html><title>Rebito</title>");
    await writeFile(join(directory, ".env"), "private fixture");
    registerWeb(app, directory);
    expect((await app.inject("/")).body).toContain("Rebito");
    expect((await app.inject("/.env")).statusCode).toBe(403);
    expect((await app.inject("/api/unknown")).statusCode).toBe(404);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
