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
    const candidates: string[] = [];
    let orphanBytes = 0;
    for (const location of [root, join(directory, "library", ".uploads")]) {
      let names: string[];
      try {
        names = await readdir(location);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        names = [];
      }
      for (const name of names) {
        const temporary = /^[a-f0-9-]{36}\.tmp$/.test(name);
        const orphan = location === root && /^[a-f0-9]{64}$/.test(name) && !references.has(name);
        if (!temporary && !orphan) continue;
        const path = join(location, name);
        const info = await lstat(path);
        if (!info.isFile()) throw new Error("Unexpected non-file in storage cleanup");
        candidates.push(path);
        orphanBytes += info.size;
      }
    }
    if (collect) for (const path of candidates) await rm(path);
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
