import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadConfig } from "../../src/server/config.ts";
import { createPlatform } from "../../src/server/platform.ts";
import { registerWeb } from "../../src/server/web.ts";
import { testDatabase } from "../database.ts";
import { seedEditor } from "../editors/library-fixture.ts";
import { seedConsoles } from "../library/console-fixture.ts";
import { seedDosEditor } from "../library/dos-editor-fixture.ts";
import { seedDos } from "../library/dos-fixture.ts";
import { seedLibrary } from "../library/fixture.ts";

const fixture = await testDatabase();
const directory = await mkdtemp(join(tmpdir(), "retro-browser-"));
await seedLibrary(directory);
await seedDos(directory);
await seedDosEditor(directory);
await seedConsoles(directory);
await seedEditor(directory);
const adminUserIds: string[] = [];
const app = await createPlatform(
  {
    ...loadConfig({
      APP_ORIGIN: "http://localhost:4317",
      DATABASE_URL: "postgresql://unused/unused",
      AUTH_SECRET: randomBytes(32).toString("hex"),
      DATA_DIR: directory,
      ALLOW_REGISTRATION: "true",
    }),
    adminUserIds,
  },
  fixture.database,
);
registerWeb(app, resolve("dist/client"));
app.addHook("onClose", async () => {
  await rm(".runtime-cache/e2e-sessions.json", { force: true });
  await rm(directory, { recursive: true, force: true });
});
const sessions: Record<string, unknown> = {};
for (const [index, name] of [
  "dos",
  "autosave",
  "library",
  "other",
  "player",
  "console",
  "editor",
  "admin",
  "admin-cd",
  "admin-jinyong",
  ...["nes", "md", "smd", "sms", "gg", "zip"].map((extension) => `admin-console-${extension}`),
].entries()) {
  // Fixture setup represents distinct clients; keep the real public rate limits enabled.
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    remoteAddress: `127.0.0.${index + 2}`,
    headers: { origin: "http://localhost:4317" },
    payload: { email: `${name}@example.test`, name, password: "browser-test-password-123" },
  });
  if (response.statusCode !== 200) throw new Error("Could not provision browser fixture");
  if (name.startsWith("admin")) adminUserIds.push(response.json().user.id);
  sessions[name] = response.cookies.map(({ name, value }) => ({
    name,
    value,
    url: "http://localhost:4317",
    httpOnly: true,
    sameSite: "Lax",
    secure: false,
  }));
}
await mkdir(".runtime-cache", { recursive: true });
await writeFile(".runtime-cache/e2e-sessions.json", JSON.stringify(sessions), { mode: 0o600 });
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    void app.close().finally(() => fixture.close());
  });
await app.listen({ host: "127.0.0.1", port: 4317 });
