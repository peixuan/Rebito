import { resolve } from "node:path";
import { Pool } from "pg";
import { loadConfig } from "./config.ts";
import { createPlatform } from "./platform.ts";
import { registerWeb } from "./web.ts";

const config = loadConfig(process.env);
const database = new Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 5000 });
const app = await createPlatform(config, database).catch(async (error: unknown) => {
  await database.end();
  throw error;
});
registerWeb(app, resolve("dist/client"));
async function close() {
  try {
    await app.close();
  } finally {
    await database.end();
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    close().catch(() => {
      app.log.error("Shutdown failed");
      process.exitCode = 1;
    });
  });
}

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  await close();
  throw error;
}
