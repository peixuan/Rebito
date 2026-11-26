import type { Pool } from "pg";
import { dosReleasePattern } from "./dos-retention.ts";
import { quotaSettingsMigration } from "./quota-settings.ts";
import { siteQuotaMigration } from "./site-quota.ts";

const initialSchema = `
CREATE TABLE profiles (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES "user"(id),
  release_id text NOT NULL,
  name varchar(80) NOT NULL CHECK (length(trim(name)) > 0),
  head_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profiles_owner ON profiles(owner_id, created_at);
CREATE TABLE revisions (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id),
  parent_id uuid,
  source text NOT NULL CHECK (source IN ('game', 'editor', 'import', 'restore')),
  manifest jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, id),
  FOREIGN KEY (profile_id, parent_id) REFERENCES revisions(profile_id, id)
);
ALTER TABLE profiles ADD CONSTRAINT profiles_head
  FOREIGN KEY (id, head_id) REFERENCES revisions(profile_id, id);
CREATE INDEX revisions_profile ON revisions(profile_id, created_at);
`;

/** Auth migrations run first. This transaction publishes the application schema atomically. */
export async function migrateStorage(database: Pool): Promise<void> {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(740721, 2)");
    await client.query("CREATE TABLE IF NOT EXISTS schema_versions (version integer PRIMARY KEY)");
    const applied = await client.query("SELECT version FROM schema_versions WHERE version = 1");
    if (applied.rowCount === 0) {
      await client.query(initialSchema);
      await client.query("INSERT INTO schema_versions VALUES (1)");
    }
    const deletionSchema = await client.query(
      "SELECT version FROM schema_versions WHERE version = 2",
    );
    if (deletionSchema.rowCount === 0) {
      await client.query(`
        CREATE INDEX profiles_release ON profiles(release_id);
        CREATE TABLE game_deletions (
          release_id text PRIMARY KEY,
          entry jsonb NOT NULL,
          preview jsonb NOT NULL,
          candidates jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        INSERT INTO schema_versions VALUES (2);
      `);
    }
    const protectionSchema = await client.query(
      "SELECT version FROM schema_versions WHERE version = 3",
    );
    if (protectionSchema.rowCount === 0) {
      await client.query(`
        ALTER TABLE revisions ADD COLUMN protected boolean NOT NULL DEFAULT true;
        ALTER TABLE revisions ALTER COLUMN protected SET DEFAULT false;
        INSERT INTO schema_versions VALUES (3);
      `);
    }
    const historyCleanup = await client.query(
      "SELECT version FROM schema_versions WHERE version = 4",
    );
    if (historyCleanup.rowCount === 0) {
      await client.query(`
        CREATE TABLE history_cleanup (
          sha256 text PRIMARY KEY CHECK (sha256 ~ '^[a-f0-9]{64}$'),
          size bigint NOT NULL CHECK (size >= 0),
          owner_id text NOT NULL
        );
        INSERT INTO schema_versions VALUES (4);
      `);
    }
    const siteQuota = await client.query("SELECT version FROM schema_versions WHERE version = 5");
    if (siteQuota.rowCount === 0) await client.query(siteQuotaMigration);
    const settings = await client.query("SELECT version FROM schema_versions WHERE version = 6");
    if (!settings.rowCount) await client.query(quotaSettingsMigration);
    const dosBackups = await client.query("SELECT version FROM schema_versions WHERE version = 7");
    if (!dosBackups.rowCount) {
      // Keep every point users already had when switching DOS to a single working save.
      await client.query(
        `UPDATE revisions r SET protected=true FROM profiles p
        WHERE p.id=r.profile_id AND p.release_id ~ $1 AND NOT r.protected`,
        [dosReleasePattern],
      );
      await client.query("INSERT INTO schema_versions VALUES (7)");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
