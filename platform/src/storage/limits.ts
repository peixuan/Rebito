import type { Pool } from "pg";
import { z } from "zod";

export const accountQuotaSchema = z.strictObject({
  profiles: z.number().int().min(1).max(10_000),
  revisions: z.number().int().min(1).max(1_000_000),
  bytes: z
    .number()
    .int()
    .min(1)
    .max(1024 ** 4),
});
export const storageLimitSchema = z.strictObject({
  profiles: accountQuotaSchema.shape.profiles.default(100),
  revisions: accountQuotaSchema.shape.revisions.default(2000),
  bytes: accountQuotaSchema.shape.bytes.default(2 * 1024 ** 3),
});
export type StorageLimits = Readonly<z.infer<typeof storageLimitSchema>>;
export interface StorageUsage {
  profiles: number;
  revisions: number;
  bytes: number;
}

/** Logical bytes include every retained revision, even when blobs are deduplicated. */
export async function storageUsage(
  database: Pick<Pool, "query">,
  owner: string,
): Promise<StorageUsage> {
  const result = await database.query(
    `
    WITH owned AS (SELECT id FROM profiles WHERE owner_id=$1),
    saved AS (SELECT manifest FROM revisions WHERE profile_id IN (SELECT id FROM owned))
    SELECT (SELECT count(*) FROM owned) AS profiles,
      (SELECT count(*) FROM saved) AS revisions,
      COALESCE((SELECT sum((artifact->>'size')::bigint) FROM saved,
        LATERAL jsonb_array_elements(manifest->'artifacts') AS artifact), 0) AS bytes`,
    [owner],
  );
  const row = result.rows[0];
  return {
    profiles: Number(row.profiles),
    revisions: Number(row.revisions),
    bytes: Number(row.bytes),
  };
}
