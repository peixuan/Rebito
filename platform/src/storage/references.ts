import type { Pool } from "pg";

type Database = Pick<Pool, "query">;

/** Remaining references are checked again on every cleanup retry. */
export async function referencedBlobs(database: Database, excludingRelease?: string) {
  const result = await database.query<{ sha256: string }>(
    `
    SELECT DISTINCT artifact->>'sha256' AS sha256
    FROM revisions r JOIN profiles p ON p.id=r.profile_id,
      LATERAL jsonb_array_elements(r.manifest->'artifacts') AS artifact
    WHERE $1::text IS NULL OR p.release_id <> $1`,
    [excludingRelease ?? null],
  );
  return new Set(result.rows.map((row) => row.sha256));
}
