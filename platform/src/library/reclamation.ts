import type { Stats } from "node:fs";
import { lstat, realpath, unlink } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import type { Pool } from "pg";
import { assertArtifactName } from "../domain/artifacts.ts";
import { releaseId } from "./catalog.ts";
import { type DeletionJob, referencedBlobs } from "./deletion-records.ts";
import { syncDirectory, withCatalog, writeCatalog } from "./transaction.ts";

async function removeOwnedFile(root: string, name: string, remove: typeof unlink) {
  assertArtifactName(name);
  const path = join(root, name);
  let details: Stats;
  try {
    details = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
  const child = relative(await realpath(root), await realpath(path));
  if (
    !details.isFile() ||
    !child ||
    child === ".." ||
    child.startsWith(`..${sep}`) ||
    isAbsolute(child)
  )
    throw new Error("Unsafe cleanup target");
  await remove(path);
  return details.size;
}

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
    let reclaimedBytes = 0;
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
