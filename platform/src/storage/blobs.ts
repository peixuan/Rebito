import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { type ArtifactRef, progressLimits } from "../domain/artifacts.ts";

export type BlobRef = Pick<ArtifactRef, "sha256" | "size">;

/** Private content-addressed storage. Authorization belongs to the revision service. */
export class LocalBlobStore {
  private readonly root: string;
  constructor(root: string) {
    this.root = root;
  }

  async put(bytes: Uint8Array): Promise<BlobRef> {
    if (bytes.byteLength > progressLimits.bytes) throw new Error("Blob exceeds storage limit");
    // Copy the input so a caller cannot change it between hashing and writing.
    const content = Buffer.from(bytes);
    const sha256 = createHash("sha256").update(content).digest("hex");
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const temporary = join(this.root, `${randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(content);
        await handle.sync();
      } finally {
        await handle.close();
      }
      // Publish without replacing an existing object, including concurrent writers.
      try {
        await link(temporary, this.path(sha256));
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
        await this.read({ sha256, size: content.byteLength });
      }
      // Linux deployment needs directory fsync to survive a host power loss.
      if (process.platform !== "win32") {
        const directory = await open(this.root, "r");
        try {
          await directory.sync();
        } finally {
          await directory.close();
        }
      }
    } finally {
      await rm(temporary, { force: true });
    }
    return { sha256, size: content.byteLength };
  }

  async read(reference: BlobRef): Promise<Uint8Array> {
    const bytes = await readFile(this.path(reference.sha256));
    if (
      bytes.byteLength !== reference.size ||
      createHash("sha256").update(bytes).digest("hex") !== reference.sha256
    ) {
      throw new Error("Stored blob failed integrity verification");
    }
    return bytes;
  }

  private path(sha256: string): string {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Invalid blob digest");
    return join(this.root, sha256);
  }
}
