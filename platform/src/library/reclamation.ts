import { unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { removeOwnedFile, syncDirectory } from "../storage/files.ts";
import { referencedBlobs } from "../storage/references.ts";
import { releaseId } from "./catalog.ts";
import { coverName } from "./covers.ts";
import type { DeletionJob } from "./deletion-records.ts";
import { withCatalog, writeCatalog } from "./transaction.ts";

/** Caller holds the exclusive online lease. Publish catalog removal before unlinking
 * any bytes, and keep the durable job until cleanup succeeds. Missing files are safe
 * on retry; newly shared blobs and assets must never be reclaimed.
 */
export async function reclaimDeletion(
  database: Pool,
  directory: string,
  job: DeletionJob,
  remove = unlink,
) {
  const libraryDirectory = join(directory, "library");
  return withCatalog(libraryDirectory, async (catalog) => {
    const removed = catalog.games.filter((entry) => releaseId(entry) !== job.release_id);
    if (removed.length !== catalog.games.length) {
      catalog.games = removed;
      await writeCatalog(libraryDirectory, catalog);
    }
    let reclaimedBytes = await removeOwnedFile(libraryDirectory, coverName(job.release_id), remove);
    if (reclaimedBytes) await syncDirectory(join(libraryDirectory, "covers"));
    if (!catalog.games.some((entry) => entry.file === job.entry.file)) {
      reclaimedBytes += await removeOwnedFile(libraryDirectory, job.entry.file, remove);
      await syncDirectory(libraryDirectory);
    }
    const retained = await referencedBlobs(database);
    const root = join(directory, "blobs");
    let removedBlob = false;
    for (const { sha256 } of job.candidates) {
      if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Invalid cleanup digest");
      if (retained.has(sha256)) continue;
      const size = await removeOwnedFile(root, sha256, remove);
      reclaimedBytes += size;
      removedBlob ||= size > 0;
    }
    if (removedBlob) await syncDirectory(root);
    await database.query("DELETE FROM game_deletions WHERE release_id=$1", [job.release_id]);
    return { status: "deleted" as const, reclaimedBytes, ...job.preview };
  });
}
