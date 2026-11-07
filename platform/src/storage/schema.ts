import type { Pool } from "pg";

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
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
