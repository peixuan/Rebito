import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { createAuth } from "../identity/auth.ts";
import { migrateIdentity } from "../identity/migrate.ts";
import { loadConfig } from "./config.ts";

// Operator-only command: credentials arrive on stdin, never in process arguments.
const config = loadConfig(process.env);
const database = new Pool({ connectionString: config.databaseUrl });
try {
  const input = readFileSync(0, "utf8");
  if (input.length > 4096) throw new Error("Account input exceeds 4096 characters");
  await migrateIdentity(config, database);
  const auth = createAuth({ ...config, allowRegistration: true }, database);
  const result = await auth.api.signUpEmail({
    body: JSON.parse(input) as { email: string; name: string; password: string },
  });
  console.log(`Created account ${result.user.id}`);
} finally {
  await database.end();
}
