import { lstat, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { assertProgressManifest } from "../domain/artifacts.ts";
import { LocalBlobStore } from "./blobs.ts";

/** A dedicated connection protects the entire app lifetime, including blob writes. */
export async function storageLease(database: Pool, exclusive: boolean) {
  const client = await database.connect();
  const suffix = exclusive ? "" : "_shared";
  try {
    const result = await client.query(
      `SELECT pg_try_advisory_lock${suffix}(740721, 3) AS acquired`,
    );
    if (!result.rows[0].acquired)
      throw new Error("Storage is in use; stop application instances before maintenance");
  } catch (error) {
    client.release();
    throw error;
  }
  return async () => {
    try {
      await client.query(`SELECT pg_advisory_unlock${suffix}(740721, 3)`);
    } finally {
      client.release();
    }
  };
}

/** Verify every referenced blob before optionally collecting unreferenced files. */
export async function maintainStorage(database: Pool, directory: string, collect = false) {
  const release = await storageLease(database, true);
  try {
    const references = new Map<string, number>();
    const revisions = await database.query("SELECT manifest FROM revisions");
    for (const { manifest } of revisions.rows) {
      assertProgressManifest(manifest);
      for (const artifact of manifest.artifacts) {
        const previous = references.get(artifact.sha256);
        if (previous !== undefined && previous !== artifact.size)
          throw new Error("Inconsistent blob references");
        references.set(artifact.sha256, artifact.size);
      }
    }
    const root = join(directory, "blobs");
    const store = new LocalBlobStore(root);
    for (const [sha256, size] of references) await store.read({ sha256, size });
    let names: string[];
    try {
      names = await readdir(root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      names = [];
    }
    const candidates: string[] = [];
    let orphanBytes = 0;
    for (const name of names) {
      if (references.has(name) || !/^(?:[a-f0-9]{64}|[a-f0-9-]{36}\.tmp)$/.test(name)) continue;
      const info = await lstat(join(root, name));
      if (!info.isFile()) throw new Error("Unexpected non-file in blob storage");
      candidates.push(name);
      orphanBytes += info.size;
    }
    if (collect) for (const name of candidates) await rm(join(root, name));
    return {
      revisions: revisions.rowCount,
      referencedBlobs: references.size,
      orphanFiles: candidates.length,
      orphanBytes,
      removed: collect ? candidates.length : 0,
    };
  } finally {
    await release();
  }
}
