import { randomUUID } from "node:crypto";
import { Pool } from "pg";

/** Every integration suite owns a separate database; no existing data is reset. */
export async function testDatabase() {
  const connectionString = process.env.PG_TEST_URL;
  if (!connectionString) throw new Error("Set PG_TEST_URL to a disposable PostgreSQL test service");
  const admin = new Pool({ connectionString });
  const name = `retro_test_${randomUUID().replaceAll("-", "")}`;
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } catch (error) {
    await admin.end();
    throw error;
  }
  const url = new URL(connectionString);
  url.pathname = `/${name}`;
  const database = new Pool({ connectionString: url.href });
  return {
    database,
    async close() {
      await database.end();
      await admin.query(`DROP DATABASE ${name}`);
      await admin.end();
    },
  };
}
