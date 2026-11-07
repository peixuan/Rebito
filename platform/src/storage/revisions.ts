import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { assertProgressManifest, type ProgressManifest } from "../domain/artifacts.ts";

export interface Profile {
  readonly id: string;
  readonly releaseId: string;
  readonly name: string;
  readonly headId: string | null;
}

export type RevisionSource = "game" | "editor" | "import" | "restore";
export interface Revision {
  readonly id: string;
  readonly profileId: string;
  readonly parentId: string | null;
  readonly source: RevisionSource;
  readonly manifest: ProgressManifest;
  readonly createdAt: Date;
}

export class ProgressError extends Error {
  readonly code: "not_found" | "conflict" | "release_mismatch";
  constructor(code: ProgressError["code"]) {
    super(code);
    this.code = code;
  }
}

const profileColumns = 'id, release_id AS "releaseId", name, head_id AS "headId"';
const revisionColumns = `r.id, r.profile_id AS "profileId", r.parent_id AS "parentId",
  r.source, r.manifest, r.created_at AS "createdAt"`;

/** The caller supplies a server-authenticated owner, never a submitted user identifier. */
export class RevisionRepository {
  private readonly database: Pool;
  constructor(database: Pool) {
    this.database = database;
  }

  async create(owner: string, releaseId: string, name: string): Promise<Profile> {
    if (!/^[a-z0-9][a-z0-9._-]{0,95}$/.test(releaseId) || !name.trim() || name.length > 80) {
      throw new Error("Invalid profile");
    }
    const result = await this.database.query<Profile>(
      `INSERT INTO profiles(id, owner_id, release_id, name) VALUES ($1, $2, $3, $4)
       RETURNING ${profileColumns}`,
      [randomUUID(), owner, releaseId, name.trim()],
    );
    return result.rows[0] as Profile;
  }

  async list(owner: string): Promise<Profile[]> {
    const result = await this.database.query<Profile>(
      `SELECT ${profileColumns} FROM profiles WHERE owner_id = $1 ORDER BY created_at, id`,
      [owner],
    );
    return result.rows;
  }

  async history(owner: string, profileId: string): Promise<Revision[]> {
    const profile = await this.database.query(
      "SELECT id FROM profiles WHERE owner_id=$1 AND id=$2",
      [owner, profileId],
    );
    if (!profile.rowCount) throw new ProgressError("not_found");
    const result = await this.database.query<Revision>(
      `SELECT ${revisionColumns} FROM revisions r WHERE r.profile_id=$1
       ORDER BY r.created_at DESC, r.id LIMIT 100`,
      [profileId],
    );
    return result.rows;
  }

  async read(owner: string, revisionId: string): Promise<Revision> {
    const result = await this.database.query<Revision>(
      `SELECT ${revisionColumns} FROM revisions r JOIN profiles p ON p.id=r.profile_id
       WHERE p.owner_id=$1 AND r.id=$2`,
      [owner, revisionId],
    );
    const revision = result.rows[0];
    if (!revision) throw new ProgressError("not_found");
    return revision;
  }

  /** Blobs must already be durable. Row locking serializes updates to the same profile. */
  async publish(
    owner: string,
    profileId: string,
    base: string | null,
    manifest: ProgressManifest,
    source: RevisionSource,
  ): Promise<Revision> {
    assertProgressManifest(manifest);
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<Profile>(
        `SELECT ${profileColumns} FROM profiles WHERE id=$1 AND owner_id=$2 FOR UPDATE`,
        [profileId, owner],
      );
      const profile = locked.rows[0];
      if (!profile) throw new ProgressError("not_found");
      if (profile.headId !== base) throw new ProgressError("conflict");
      if (profile.releaseId !== manifest.releaseId) throw new ProgressError("release_mismatch");
      const id = randomUUID();
      const result = await client.query<Revision>(
        `INSERT INTO revisions AS r(id, profile_id, parent_id, source, manifest)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${revisionColumns}`,
        [id, profileId, base, source, JSON.stringify(manifest)],
      );
      await client.query("UPDATE profiles SET head_id=$1 WHERE id=$2", [id, profileId]);
      await client.query("COMMIT");
      return result.rows[0] as Revision;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
