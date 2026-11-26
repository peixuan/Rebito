import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  type ArtifactRef,
  assertProgressManifest,
  type ProgressManifest,
} from "../domain/artifacts.ts";
import { dosReleasePattern, retireDosHead } from "./dos-retention.ts";
import { type StorageLimits, storageLimitSchema, storageUsage } from "./limits.ts";
import { quotaSettings } from "./quota-settings.ts";
import { defaultSiteLimits, type SiteSaveLimits, siteUsage } from "./site-quota.ts";

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
  readonly protected: boolean;
}

export class ProgressError extends Error {
  readonly code:
    | "not_found"
    | "conflict"
    | "release_mismatch"
    | "quota_exceeded"
    | "site_quota_exceeded";
  constructor(code: ProgressError["code"]) {
    super(code);
    this.code = code;
  }
}

const profileColumns = 'id, release_id AS "releaseId", name, head_id AS "headId"';
const revisionColumns = `r.id, r.profile_id AS "profileId", r.parent_id AS "parentId",
  r.source, r.manifest, r.created_at AS "createdAt", r.protected`;

/** The caller supplies a server-authenticated owner, never a submitted user identifier. */
export class RevisionRepository {
  private readonly database: Pool;
  readonly limits: StorageLimits;
  private readonly siteLimits: SiteSaveLimits;
  constructor(
    database: Pool,
    limits: StorageLimits = storageLimitSchema.parse({}),
    siteLimits = defaultSiteLimits,
  ) {
    this.siteLimits = siteLimits;
    this.database = database;
    this.limits = storageLimitSchema.parse(limits);
  }

  async create(owner: string, releaseId: string, name: string): Promise<Profile> {
    if (!/^[a-z0-9][a-z0-9._-]{0,95}$/.test(releaseId) || !name.trim() || name.length > 80) {
      throw new Error("Invalid profile");
    }
    return this.transaction(owner, async (client) => {
      const { account } = await quotaSettings(client, this.limits, this.siteLimits);
      if ((await storageUsage(client, owner)).profiles >= account.profiles)
        throw new ProgressError("quota_exceeded");
      const result = await client.query<Profile>(
        `INSERT INTO profiles(id, owner_id, release_id, name) VALUES ($1, $2, $3, $4)
       RETURNING ${profileColumns}`,
        [randomUUID(), owner, releaseId, name.trim()],
      );
      return result.rows[0] as Profile;
    });
  }

  async usage(owner: string) {
    const { account } = await quotaSettings(this.database, this.limits, this.siteLimits);
    return { used: await storageUsage(this.database, owner), limits: account };
  }

  async assertCapacity(
    owner: string,
    profileId: string,
    base: string | null,
    manifest: ProgressManifest,
  ) {
    await this.transaction(owner, async (client) => {
      const { site, bytes, count } = await this.checkPublication(
        client,
        owner,
        profileId,
        base,
        manifest,
      );
      const used = await siteUsage(client);
      if (used.bytes + bytes > site.bytes || used.revisions + count > site.revisions)
        throw new ProgressError("site_quota_exceeded");
    });
  }

  /** Both preflight and commit check the same locked head and its net quota cost. */
  private async checkPublication(
    database: PoolClient,
    owner: string,
    profileId: string,
    base: string | null,
    manifest: ProgressManifest,
  ) {
    const { account, site } = await quotaSettings(database, this.limits, this.siteLimits);
    const {
      rows: [profile],
    } = await database.query(
      `SELECT p.release_id, p.head_id, r.parent_id,
        CASE WHEN p.head_id IS NOT NULL AND NOT r.protected AND p.release_id ~ $3
          THEN revision_bytes(r.manifest) END AS credit
       FROM profiles p LEFT JOIN revisions r ON r.id=p.head_id
       WHERE p.id=$1 AND p.owner_id=$2 FOR UPDATE OF p`,
      [profileId, owner, dosReleasePattern],
    );
    if (!profile) throw new ProgressError("not_found");
    if (profile.head_id !== base) throw new ProgressError("conflict");
    if (profile.release_id !== manifest.releaseId) throw new ProgressError("release_mismatch");
    const replaced =
      profile.credit === null
        ? undefined
        : { bytes: Number(profile.credit), parentId: profile.parent_id };
    const bytes =
      manifest.artifacts.reduce((sum, file) => sum + file.size, 0) - (replaced?.bytes ?? 0);
    const count = replaced ? 0 : 1;
    const used = await storageUsage(database, owner);
    if (used.revisions + count > account.revisions || used.bytes + bytes > account.bytes)
      throw new ProgressError("quota_exceeded");
    return { site, bytes, count, replaced };
  }

  /** Record candidates before disk I/O. Exclusive cleanup waits for live writers. */
  async trackPendingFiles(owner: string, artifacts: readonly ArtifactRef[]) {
    await this.database.query(
      `INSERT INTO history_cleanup(sha256, size, owner_id)
       SELECT DISTINCT sha256, size, $2 FROM jsonb_to_recordset($1) AS file(sha256 text, size bigint)
       ORDER BY sha256 ON CONFLICT (sha256) DO NOTHING`,
      [JSON.stringify(artifacts), owner],
    );
  }

  async list(owner: string): Promise<Profile[]> {
    const result = await this.database.query<Profile>(
      `SELECT ${profileColumns} FROM profiles WHERE owner_id = $1 ORDER BY created_at, id`,
      [owner],
    );
    return result.rows;
  }

  async history(owner: string, profileId: string, before?: string): Promise<Revision[]> {
    const profile = await this.database.query(
      "SELECT id FROM profiles WHERE owner_id=$1 AND id=$2",
      [owner, profileId],
    );
    if (!profile.rowCount) throw new ProgressError("not_found");
    if (before) {
      const cursor = await this.database.query(
        "SELECT id FROM revisions WHERE profile_id=$1 AND id=$2",
        [profileId, before],
      );
      if (!cursor.rowCount) throw new ProgressError("not_found");
    }
    // Compare in PostgreSQL: JavaScript dates lose sub-millisecond timestamp precision.
    const result = await this.database.query<Revision>(
      `SELECT ${revisionColumns} FROM revisions r WHERE r.profile_id=$1
       AND ($2::uuid IS NULL OR EXISTS (
         SELECT 1 FROM revisions cursor WHERE cursor.id=$2 AND cursor.profile_id=$1
         AND (r.created_at < cursor.created_at OR
           (r.created_at=cursor.created_at AND r.id>cursor.id))))
       ORDER BY r.created_at DESC, r.id LIMIT 100`,
      [profileId, before ?? null],
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

  /** Protection changes neither the head nor save bytes; reject stale UI toggles. */
  async protect(owner: string, revisionId: string, expected: boolean, protectedPoint: boolean) {
    return this.transaction(owner, async (client) => {
      const result = await client.query<Revision>(
        `SELECT ${revisionColumns} FROM revisions r JOIN profiles p ON p.id=r.profile_id
         WHERE p.owner_id=$1 AND r.id=$2`,
        [owner, revisionId],
      );
      const revision = result.rows[0];
      if (!revision) throw new ProgressError("not_found");
      if (revision.protected !== expected) throw new ProgressError("conflict");
      await client.query("UPDATE revisions SET protected=$1 WHERE id=$2", [
        protectedPoint,
        revisionId,
      ]);
      return { ...revision, protected: protectedPoint };
    });
  }

  /** Blobs must already be durable. Row locking serializes updates to the same profile. */
  async publish(
    owner: string,
    profileId: string,
    base: string | null,
    manifest: ProgressManifest,
    source: RevisionSource,
    backup = false,
  ): Promise<Revision> {
    assertProgressManifest(manifest);
    return this.transaction(owner, async (client) => {
      const { site, replaced } = await this.checkPublication(
        client,
        owner,
        profileId,
        base,
        manifest,
      );
      const id = randomUUID();
      const result = await client.query<Revision>(
        `INSERT INTO revisions AS r(id, profile_id, parent_id, source, manifest, protected)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${revisionColumns}`,
        [
          id,
          profileId,
          replaced ? replaced.parentId : base,
          source,
          JSON.stringify(manifest),
          backup,
        ],
      );
      await client.query("UPDATE profiles SET head_id=$1 WHERE id=$2", [id, profileId]);
      if (replaced && base) await retireDosHead(client, owner, base);
      const used = await siteUsage(client);
      if (used.bytes > site.bytes || used.revisions > site.revisions)
        throw new ProgressError("site_quota_exceeded");
      await client.query("DELETE FROM history_cleanup WHERE sha256 = ANY($1::text[])", [
        manifest.artifacts.map((artifact) => artifact.sha256),
      ]);
      // A publication receipt identifies the verified input for clients applying live edits.
      // A subsequent history read exposes the compacted chain of retained revisions.
      return { ...(result.rows[0] as Revision), parentId: base };
    });
  }

  private async transaction<T>(
    owner: string,
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      // Serialize writes across all of this user's profiles, not just one head.
      const user = await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [owner]);
      if (!user.rowCount) throw new ProgressError("not_found");
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
