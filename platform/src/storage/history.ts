import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { assertProgressManifest, type ProgressManifest } from "../domain/artifacts.ts";
import type { BlobRef } from "./blobs.ts";
import type { StorageLimits } from "./limits.ts";
import { quotaSettings } from "./quota-settings.ts";
import { referencedBlobs } from "./references.ts";
import { type HistoryEntry, planHistory } from "./retention-policy.ts";
import { ProgressError } from "./revisions.ts";

interface StoredHistory extends HistoryEntry {
  parentId: string | null;
  manifest: ProgressManifest;
}
export interface HistoryPreview {
  token: string;
  revisions: { id: string; createdAt: Date; bytes: number }[];
  logicalBytes: number;
  reclaimableBytes: number;
  protectedRevisions: number;
  remainingAccountBytes: number;
}

/** Manual previews apply to one owned profile; automatic selection spans the account. */
export async function historyPlan(
  database: Pick<Pool, "query">,
  owner: string,
  limits: StorageLimits,
  profileId?: string,
) {
  if (profileId) {
    const owned = await database.query("SELECT id FROM profiles WHERE id=$1 AND owner_id=$2", [
      profileId,
      owner,
    ]);
    if (!owned.rowCount) throw new ProgressError("not_found");
  }
  const result = await database.query<StoredHistory>(
    `SELECT r.id, r.profile_id AS "profileId", r.parent_id AS "parentId", r.protected,
      r.created_at AS "createdAt", r.manifest, r.id=p.head_id AS current
     FROM revisions r JOIN profiles p ON p.id=r.profile_id WHERE p.owner_id=$1 ORDER BY r.id`,
    [owner],
  );
  const rows = result.rows.map((row) => {
    assertProgressManifest(row.manifest);
    return { ...row, bytes: row.manifest.artifacts.reduce((sum, file) => sum + file.size, 0) };
  });
  const { account } = await quotaSettings(database, limits);
  const removed = planHistory(rows, account, Date.now(), Boolean(profileId)).filter(
    (row) => !profileId || row.profileId === profileId,
  );
  const candidates = new Map<string, BlobRef>();
  for (const row of removed) {
    if (row.current || row.protected) throw new Error("Retention selected protected history");
    for (const file of row.manifest.artifacts) {
      const previous = candidates.get(file.sha256);
      if (previous && previous.size !== file.size) throw new Error("Inconsistent blob sizes");
      candidates.set(file.sha256, { sha256: file.sha256, size: file.size });
    }
  }
  const referenced = removed.length
    ? await referencedBlobs(
        database,
        undefined,
        removed.map((row) => row.id),
      )
    : new Set<string>();
  const logicalBytes = removed.reduce((sum, row) => sum + row.bytes, 0);
  const preview: HistoryPreview = {
    token: "",
    revisions: removed.map(({ id, createdAt, bytes }) => ({ id, createdAt, bytes })),
    logicalBytes,
    reclaimableBytes: [...candidates.values()].reduce(
      (sum, file) => sum + (referenced.has(file.sha256) ? 0 : file.size),
      0,
    ),
    protectedRevisions: rows.filter(
      (row) => row.protected && (!profileId || row.profileId === profileId),
    ).length,
    remainingAccountBytes: rows.reduce((sum, row) => sum + row.bytes, 0) - logicalBytes,
  };
  preview.token = createHash("sha256")
    .update(JSON.stringify({ profileId, rows, preview }))
    .digest("hex");
  return { rows, removed, candidates: [...candidates.values()], preview };
}

/** Caller holds the exclusive online lease. Metadata compaction and durable cleanup
 * intent commit together; a failed transaction changes neither heads nor history.
 */
export async function pruneHistory(
  database: Pool,
  owner: string,
  limits: StorageLimits,
  confirmation?: { profileId: string; token: string },
) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [owner]);
    if (!user.rowCount) throw new ProgressError("not_found");
    await client.query("LOCK TABLE profiles, revisions IN SHARE ROW EXCLUSIVE MODE");
    const plan = await historyPlan(client, owner, limits, confirmation?.profileId);
    if (confirmation && confirmation.token !== plan.preview.token)
      throw new ProgressError("conflict");
    const removed = new Set(plan.removed.map((row) => row.id));
    const rows = new Map(plan.rows.map((row) => [row.id, row]));
    for (const row of plan.rows) {
      if (removed.has(row.id) || !row.parentId || !removed.has(row.parentId)) continue;
      let parent = row.parentId;
      const visited = new Set<string>();
      while (parent && removed.has(parent)) {
        if (visited.has(parent)) throw new Error("Cyclic revision ancestry");
        visited.add(parent);
        const ancestor = rows.get(parent);
        if (!ancestor) throw new Error("Missing revision ancestry");
        parent = ancestor.parentId ?? "";
      }
      await client.query("UPDATE revisions SET parent_id=$1 WHERE id=$2", [parent || null, row.id]);
    }
    for (const file of plan.candidates) {
      await client.query(
        "INSERT INTO history_cleanup(sha256,size,owner_id) VALUES ($1,$2,$3) ON CONFLICT (sha256) DO NOTHING",
        [file.sha256, file.size, owner],
      );
    }
    if (removed.size)
      await client.query("DELETE FROM revisions WHERE id=ANY($1::uuid[])", [[...removed]]);
    await client.query("COMMIT");
    return plan.preview;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
