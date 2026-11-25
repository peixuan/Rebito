import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { ProgressError } from "./revisions.ts";

/** The token binds confirmation to this owner, profile, head and protected history. */
export async function profileDeletionImpact(db: Pick<Pool, "query">, owner: string, id: string) {
  const profile = await db.query<{ name: string; head_id: string | null }>(
    "SELECT name, head_id FROM profiles WHERE owner_id=$1 AND id=$2",
    [owner, id],
  );
  const row = profile.rows[0];
  if (!row) throw new ProgressError("not_found");
  const revisions = await db.query<{ id: string; protected: boolean }>(
    "SELECT id, protected FROM revisions WHERE profile_id=$1 ORDER BY id",
    [id],
  );
  return {
    name: row.name,
    revisions: revisions.rows.length,
    protectedRevisions: revisions.rows.filter((entry) => entry.protected).length,
    token: createHash("sha256")
      .update(JSON.stringify([owner, id, row, revisions.rows]))
      .digest("hex"),
  };
}

export type ProfileDeletionImpact = Awaited<ReturnType<typeof profileDeletionImpact>>;

/** Called under the exclusive storage lease. Failed file cleanup survives a restart. */
export async function deleteProfile(database: Pool, owner: string, id: string, token: string) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [owner]);
    const impact = await profileDeletionImpact(client, owner, id);
    if (impact.token !== token) throw new ProgressError("conflict");
    await client.query(
      `INSERT INTO history_cleanup(sha256,size,owner_id)
       SELECT DISTINCT file->>'sha256', (file->>'size')::bigint, $2
       FROM revisions, LATERAL jsonb_array_elements(manifest->'artifacts') AS file
       WHERE profile_id=$1 ON CONFLICT (sha256) DO NOTHING`,
      [id, owner],
    );
    await client.query("UPDATE profiles SET head_id=NULL WHERE id=$1 AND owner_id=$2", [id, owner]);
    await client.query("DELETE FROM revisions WHERE profile_id=$1", [id]);
    await client.query("DELETE FROM profiles WHERE id=$1 AND owner_id=$2", [id, owner]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
