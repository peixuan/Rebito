import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { assertProgressManifest } from "../domain/artifacts.ts";
import { message } from "../shared/messages.ts";
import type { BlobRef } from "../storage/blobs.ts";
import { referencedBlobs } from "../storage/references.ts";
import { type LibraryEntry, releaseId } from "./catalog.ts";
import type { Catalog } from "./transaction.ts";
import { LibraryError } from "./upload-settings.ts";

type Database = Pick<Pool, "query">;
export interface DeletionPreview {
  id: string;
  title: string;
  token: string;
  users: number;
  profiles: number;
  revisions: number;
  saveBytes: number;
  reclaimableBytes: number;
}
export interface DeletionJob {
  release_id: string;
  entry: LibraryEntry;
  preview: DeletionPreview;
  candidates: BlobRef[];
}

export async function deletionImpact(database: Database, catalog: Catalog, entry: LibraryEntry) {
  const id = releaseId(entry);
  const profiles = await database.query(
    "SELECT id, owner_id, head_id FROM profiles WHERE release_id=$1 ORDER BY id",
    [id],
  );
  const revisions = await database.query(
    `
    SELECT r.id, r.manifest FROM revisions r JOIN profiles p ON p.id=r.profile_id
    WHERE p.release_id=$1 ORDER BY r.id`,
    [id],
  );
  const candidates = new Map<string, number>();
  let saveBytes = 0;
  for (const { manifest } of revisions.rows) {
    assertProgressManifest(manifest);
    for (const artifact of manifest.artifacts) {
      if (candidates.has(artifact.sha256) && candidates.get(artifact.sha256) !== artifact.size)
        throw new Error("Inconsistent blob sizes");
      candidates.set(artifact.sha256, artifact.size);
      saveBytes += artifact.size;
    }
  }
  const retained = await referencedBlobs(database, id);
  const gameBytes = catalog.games.some(
    (other) => releaseId(other) !== id && other.file === entry.file,
  )
    ? 0
    : entry.size;
  const preview: DeletionPreview = {
    id,
    title: entry.title,
    token: "",
    users: new Set(profiles.rows.map((row) => row.owner_id)).size,
    profiles: profiles.rows.length,
    revisions: revisions.rows.length,
    saveBytes,
    reclaimableBytes:
      gameBytes +
      [...candidates].reduce((sum, [hash, size]) => sum + (retained.has(hash) ? 0 : size), 0),
  };
  preview.token = createHash("sha256")
    .update(
      JSON.stringify({
        entry,
        profiles: profiles.rows,
        revisions: revisions.rows.map((row) => row.id),
        preview,
      }),
    )
    .digest("hex");
  return { preview, candidates: [...candidates].map(([sha256, size]) => ({ sha256, size })) };
}

export async function pendingDeletions(database: Database): Promise<DeletionJob[]> {
  return (
    await database.query<DeletionJob>(
      "SELECT * FROM game_deletions ORDER BY created_at, release_id",
    )
  ).rows;
}

export async function assertNoPendingDeletion(database: Database) {
  if ((await database.query("SELECT 1 FROM game_deletions LIMIT 1")).rowCount)
    throw new LibraryError(message("library.deletionPending"), 409);
}

/** Record cleanup intent and remove all owners' history in the same transaction.
 * The HTTP caller already holds the exclusive online lease, excluding blob writers.
 * Table locks also prevent an accidental direct repository writer from escaping CAS.
 */
export async function beginDeletion(
  database: Pool,
  catalog: Catalog,
  entry: LibraryEntry,
  confirmation: { token: string; title: string; deleteSaves: boolean },
) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE profiles, revisions IN SHARE ROW EXCLUSIVE MODE");
    const { preview, candidates } = await deletionImpact(client, catalog, entry);
    if (confirmation.token !== preview.token)
      throw new LibraryError(message("library.deletionConflict"), 409);
    if (confirmation.title !== entry.title || (preview.profiles > 0 && !confirmation.deleteSaves))
      throw new LibraryError(message("library.deletionConfirmation"));
    const id = releaseId(entry);
    await client.query(
      "INSERT INTO game_deletions(release_id, entry, preview, candidates) VALUES ($1,$2,$3,$4)",
      [id, JSON.stringify(entry), JSON.stringify(preview), JSON.stringify(candidates)],
    );
    await client.query("UPDATE profiles SET head_id=NULL WHERE release_id=$1", [id]);
    await client.query(
      "DELETE FROM revisions WHERE profile_id IN (SELECT id FROM profiles WHERE release_id=$1)",
      [id],
    );
    await client.query("DELETE FROM profiles WHERE release_id=$1", [id]);
    await client.query("COMMIT");
    return { release_id: id, entry, preview, candidates } satisfies DeletionJob;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
