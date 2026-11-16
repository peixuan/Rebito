import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import type { Pool } from "pg";
import type { ServerConfig } from "../server/config.ts";
import { identityOptions } from "./auth.ts";

interface Reservation {
  user_id: string;
  email: string;
  complete: boolean;
}

/** Reserve a stable identity before creating credentials; retries never adopt an existing user. */
export async function initializeAdministrator(
  config: ServerConfig,
  database: Pool,
): Promise<string | undefined> {
  const lock = await database.connect();
  try {
    await lock.query("SELECT pg_advisory_lock(741616, 1)");
    await lock.query(`CREATE TABLE IF NOT EXISTS bootstrap_administrator (
      singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
      user_id text NOT NULL UNIQUE, email text NOT NULL, complete boolean NOT NULL DEFAULT false
    )`);
    let reservation = (await lock.query<Reservation>("SELECT * FROM bootstrap_administrator"))
      .rows[0];
    if (reservation?.complete) return reservation.user_id;
    const credentials = config.initialAdmin;
    if (!credentials) {
      if (reservation) throw new Error("Incomplete administrator initialization");
      return undefined;
    }
    if (reservation && reservation.email !== credentials.email)
      throw new Error("Pending administrator identity differs");
    const existing = await lock.query<{ id: string }>(
      'SELECT id FROM "user" WHERE lower(email) = $1',
      [credentials.email],
    );
    if (existing.rows[0] && existing.rows[0].id !== reservation?.user_id)
      throw new Error("Existing accounts cannot be adopted");
    if (!reservation) {
      reservation = { user_id: randomUUID(), email: credentials.email, complete: false };
      await lock.query("INSERT INTO bootstrap_administrator (user_id, email) VALUES ($1, $2)", [
        reservation.user_id,
        reservation.email,
      ]);
    }
    if (!existing.rows.length) {
      const userId = reservation.user_id;
      const options = identityOptions({ ...config, allowRegistration: true }, database);
      // This instance is never exposed over HTTP. Better Auth owns password hashing
      // and its PostgreSQL signup transaction; the reservation survives interruptions.
      const auth = betterAuth({
        ...options,
        emailAndPassword: { ...options.emailAndPassword, autoSignIn: false },
        advanced: {
          ...options.advanced,
          database: { generateId: ({ model }) => (model === "user" ? userId : randomUUID()) },
        },
      });
      await auth.api.signUpEmail({ body: credentials });
    }
    // Duplicate signup may return a synthetic user. Grant authority only after
    // checking the persisted reserved ID and its credential, never the response ID.
    const created = await lock.query(
      `SELECT 1 FROM "user" u JOIN "account" a ON a."userId" = u.id
       WHERE u.id = $1 AND u.email = $2 AND a."providerId" = 'credential'
       AND a.password IS NOT NULL AND length(a.password) > 0`,
      [reservation.user_id, reservation.email],
    );
    if (!created.rows.length) throw new Error("Reserved administrator has no credential");
    await lock.query("UPDATE bootstrap_administrator SET complete = true WHERE singleton");
    return reservation.user_id;
  } catch {
    // Startup errors must not include credentials or database parameter details.
    throw new Error(
      "Administrator initialization failed; existing accounts are never overwritten.",
    );
  } finally {
    try {
      await lock.query("SELECT pg_advisory_unlock(741616, 1)");
    } finally {
      lock.release();
    }
  }
}
