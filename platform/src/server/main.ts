import { Pool } from "pg";
import { createAuth } from "../identity/auth.ts";
import { migrateIdentity } from "../identity/migrate.ts";
import { registerIdentity } from "../identity/routes.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig(process.env);
const database = new Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 5000 });
const app = createApp();
app.addHook("onClose", async () => {
  await database.end();
});
app.get("/health/ready", async () => {
  await database.query("SELECT 1");
  return { status: "ok" };
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.close().catch((error: unknown) => {
      app.log.error(error, "Shutdown failed");
      process.exitCode = 1;
    });
  });
}

try {
  await migrateIdentity(config, database);
  registerIdentity(app, createAuth(config, database), config);
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  await app.close();
  throw error;
}
