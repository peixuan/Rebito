import { statfs } from "node:fs/promises";

export class DiskSpaceError extends Error {
  constructor() {
    super("Insufficient free storage space");
  }
}

/** A conservative reserve for this store's concurrent writes, not a filesystem quota. */
export class DiskCapacity {
  private pendingBytes = 0;
  private readonly minimumFreeBytes: number;

  constructor(minimumFreeBytes = 1024 ** 3) {
    if (!Number.isSafeInteger(minimumFreeBytes) || minimumFreeBytes < 0)
      throw new Error("Invalid disk reserve");
    this.minimumFreeBytes = minimumFreeBytes;
  }

  async write<T>(directory: string, bytes: number, action: () => Promise<T>): Promise<T> {
    // Reserve before awaiting statfs so overlapping uploads cannot spend the same space.
    // Partially written files may be counted twice; failing conservatively is preferable.
    this.pendingBytes += bytes;
    try {
      const space = await statfs(directory, { bigint: true });
      if (space.bavail * space.bsize < BigInt(this.minimumFreeBytes) + BigInt(this.pendingBytes))
        throw new DiskSpaceError();
      return await action();
    } catch (error) {
      if (["ENOSPC", "EDQUOT"].includes((error as NodeJS.ErrnoException)?.code ?? ""))
        throw new DiskSpaceError();
      throw error;
    } finally {
      this.pendingBytes -= bytes;
    }
  }
}
