import { resolve } from "node:path";
import { Pool } from "pg";
import { maintainStorage } from "./maintenance.ts";

const [action, ...extra] = process.argv.slice(2);
if (!["verify", "collect"].includes(action ?? "") || extra.length)
  throw new Error("Usage: maintain-storage verify|collect (stop the application first)");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const database = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
try {
  console.log(
    JSON.stringify(
      await maintainStorage(
        database,
        resolve(process.env.DATA_DIR ?? ".data"),
        action === "collect",
      ),
    ),
  );
} finally {
  await database.end();
}
