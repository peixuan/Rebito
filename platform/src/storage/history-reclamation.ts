import { unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { removeOwnedFile, syncDirectory } from "./files.ts";
import { referencedBlobs } from "./references.ts";

/** Exclusive online lease required. Interrupted batches retain durable candidates;
 * references are rechecked on every retry, including newly published shared files.
 */
export async function reclaimHistory(
  database: Pool,
  directory: string,
  owner?: string,
  remove = unlink,
) {
  const jobs = await database.query<{ sha256: string }>(
    "SELECT sha256 FROM history_cleanup WHERE $1::text IS NULL OR owner_id=$1 ORDER BY sha256 LIMIT 128",
    [owner ?? null],
  );
  const referenced = await referencedBlobs(database);
  const root = join(directory, "blobs");
  let reclaimedBytes = 0;
  for (const { sha256 } of jobs.rows) {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Invalid cleanup digest");
    if (!referenced.has(sha256)) {
      reclaimedBytes += await removeOwnedFile(root, sha256, remove);
      await syncDirectory(root);
    }
    await database.query("DELETE FROM history_cleanup WHERE sha256=$1", [sha256]);
  }
  const pending = await database.query(
    "SELECT count(*) FROM history_cleanup WHERE $1::text IS NULL OR owner_id=$1",
    [owner ?? null],
  );
  return { reclaimedBytes, pendingFiles: Number(pending.rows[0].count) };
}
