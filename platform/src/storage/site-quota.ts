import type { Pool } from "pg";

import { z } from "zod";

export const siteLimitSchema = z.strictObject({
  bytes: z
    .number()
    .int()
    .min(1)
    .max(1024 ** 4),
  revisions: z.number().int().min(1).max(10_000_000),
});
export type SiteSaveLimits = Readonly<z.infer<typeof siteLimitSchema>>;

export const defaultSiteLimits: SiteSaveLimits = { bytes: 10 * 1024 ** 3, revisions: 10_000 };

/** Install in one transaction while publications and history deletions are excluded. */
export const siteQuotaMigration = `
  LOCK TABLE revisions IN SHARE ROW EXCLUSIVE MODE;
  CREATE FUNCTION revision_bytes(document jsonb) RETURNS bigint
    LANGUAGE sql IMMUTABLE AS $$
      SELECT COALESCE(sum((file->>'size')::bigint), 0)::bigint
      FROM jsonb_array_elements(document->'artifacts') file
    $$;
  CREATE TABLE site_save_usage (
    singleton boolean PRIMARY KEY CHECK (singleton),
    bytes bigint NOT NULL CHECK (bytes >= 0),
    revisions bigint NOT NULL CHECK (revisions >= 0)
  );
  INSERT INTO site_save_usage SELECT true, COALESCE(sum(revision_bytes(manifest)), 0), count(*) FROM revisions;
  CREATE FUNCTION account_revision_bytes() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE delta bigint := 0;
    BEGIN
      IF TG_OP <> 'INSERT' THEN delta := delta - revision_bytes(OLD.manifest); END IF;
      IF TG_OP <> 'DELETE' THEN delta := delta + revision_bytes(NEW.manifest); END IF;
      UPDATE site_save_usage SET bytes = bytes + delta,
        revisions = revisions + CASE TG_OP WHEN 'INSERT' THEN 1 WHEN 'DELETE' THEN -1 ELSE 0 END
        WHERE singleton;
      RETURN NULL;
    END
  $$;
  CREATE TRIGGER revision_usage AFTER INSERT OR UPDATE OF manifest OR DELETE ON revisions
    FOR EACH ROW EXECUTE FUNCTION account_revision_bytes();
  INSERT INTO schema_versions VALUES (5);
`;

/** After INSERT the counter row stays locked until commit, including across owners. */
export async function siteUsage(database: Pick<Pool, "query">): Promise<SiteSaveLimits> {
  const result = await database.query(
    "SELECT bytes, revisions FROM site_save_usage WHERE singleton",
  );
  return { bytes: Number(result.rows[0].bytes), revisions: Number(result.rows[0].revisions) };
}
