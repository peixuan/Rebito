import type { Pool } from "pg";
import { z } from "zod";
import { accountQuotaSchema, type StorageLimits } from "./limits.ts";
import { defaultSiteLimits, siteLimitSchema } from "./site-quota.ts";

export const quotaSchema = z.strictObject({
  account: accountQuotaSchema,
  site: siteLimitSchema,
});
export type SaveQuotas = z.infer<typeof quotaSchema>;
export type QuotaSettings = SaveQuotas & { version: number };
type Database = Pick<Pool, "query">;

export const quotaSettingsMigration = `
  CREATE TABLE save_quota_settings (
    singleton boolean PRIMARY KEY CHECK (singleton),
    version integer NOT NULL DEFAULT 0,
    quotas jsonb
  );
  INSERT INTO save_quota_settings(singleton) VALUES (true);
  INSERT INTO schema_versions VALUES (6);
`;

/** Environment values are the defaults until an administrator saves a policy. */
export async function quotaSettings(
  database: Database,
  account: StorageLimits,
  site = defaultSiteLimits,
): Promise<QuotaSettings> {
  const {
    rows: [row],
  } = await database.query("SELECT version, quotas FROM save_quota_settings WHERE singleton");
  return {
    ...(row.quotas ? quotaSchema.parse(row.quotas) : { account, site }),
    version: row.version,
  };
}

/** Compare and swap so a stale administrator tab cannot overwrite an intervening change. */
export async function updateQuotas(database: Database, version: number, quotas: SaveQuotas) {
  const result = await database.query(
    "UPDATE save_quota_settings SET quotas=$1, version=version+1 WHERE singleton AND version=$2 RETURNING version",
    [JSON.stringify(quotaSchema.parse(quotas)), version],
  );
  return result.rows[0]?.version as number | undefined;
}
