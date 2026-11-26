import type { Pool } from "pg";

/** Installed release IDs bind a system to its immutable asset digest. */
export const dosReleasePattern = "^dos-[a-f0-9]{64}$";

/** Called in the same transaction as publication, after moving the head.
 * The exclusive cleanup worker checks shared blob references before unlinking. */
export async function retireDosHead(database: Pick<Pool, "query">, owner: string, id: string) {
  await database.query(
    `INSERT INTO history_cleanup(sha256,size,owner_id)
    SELECT DISTINCT file->>'sha256',(file->>'size')::bigint,$2 FROM revisions,
    LATERAL jsonb_array_elements(manifest->'artifacts') file WHERE id=$1
    ORDER BY 1 ON CONFLICT (sha256) DO NOTHING`,
    [id, owner],
  );
  await database.query("DELETE FROM revisions WHERE id=$1", [id]);
}
