import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadConfig } from "../../src/server/config.ts";
import { createPlatform } from "../../src/server/platform.ts";
import { registerWeb } from "../../src/server/web.ts";
import { testDatabase } from "../database.ts";
import { seedLibrary } from "../library/fixture.ts";

const fixture = await testDatabase();
const directory = await mkdtemp(join(tmpdir(), "retro-browser-"));
await seedLibrary(directory);
const app = await createPlatform(
  loadConfig({
    APP_ORIGIN: "http://localhost:4317",
    DATABASE_URL: "postgresql://unused/unused",
    AUTH_SECRET: randomBytes(32).toString("hex"),
    DATA_DIR: directory,
    ALLOW_REGISTRATION: "true",
  }),
  fixture.database,
);
registerWeb(app, resolve("dist/client"));
app.addHook("onClose", async () => {
  await fixture.close();
  await rm(directory, { recursive: true, force: true });
});
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    void app.close();
  });
await app.listen({ host: "127.0.0.1", port: 4317 });
