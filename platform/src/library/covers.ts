import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { message } from "../shared/messages.ts";
import { DiskCapacity } from "../storage/capacity.ts";
import { removeOwnedFile, syncDirectory } from "../storage/files.ts";
import type { Game } from "./catalog.ts";
import { LibraryError } from "./upload-settings.ts";

export const coverBudget = 32 * 1024 ** 2;
export function coverName(id: string) {
  return `covers/${id}.png`;
}
export async function coverInfo(directory: string, id: string) {
  try {
    const stat = await lstat(join(directory, coverName(id)), { bigint: true });
    if (!stat.isFile()) throw new Error("Invalid cover file");
    return { version: [stat.ino, stat.mtimeNs, stat.size].join("-"), size: Number(stat.size) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
async function coverIds(directory: string) {
  try {
    return (await readdir(join(directory, "covers")))
      .filter((n) => /^[a-z0-9]+-[0-9a-f]{64}\.png$/.test(n))
      .map((n) => n.slice(0, -4));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
export async function withCovers(directory: string, games: readonly Game[]) {
  const ids = new Set(await coverIds(directory));
  return Promise.all(
    games.map(async (game) => {
      const info = ids.has(game.id) ? await coverInfo(directory, game.id) : null;
      return info ? { ...game, cover: info.version } : game;
    }),
  );
}
/** The caller holds the catalog writer lock and the exclusive storage lease. */
export async function replaceCover(
  directory: string,
  id: string,
  expected: string | null,
  bytes: Buffer | null,
  minimumFree: number,
) {
  const prior = await coverInfo(directory, id);
  if ((prior?.version ?? null) !== expected) throw new LibraryError(message("cover.changed"), 409);
  if (!bytes) {
    if (prior) {
      await removeOwnedFile(directory, coverName(id), rm);
      await syncDirectory(join(directory, "covers"));
    }
    return null;
  }
  let used = 0;
  for (const other of await coverIds(directory))
    if (other !== id) used += (await coverInfo(directory, other))?.size ?? 0;
  if (used + bytes.length > coverBudget) throw new LibraryError(message("cover.full"), 507);
  const staging = join(directory, ".uploads"),
    covers = join(directory, "covers");
  await mkdir(staging, { recursive: true, mode: 0o700 });
  await mkdir(covers, { recursive: true, mode: 0o700 });
  return new DiskCapacity(minimumFree).write(staging, bytes.length, async () => {
    const tmp = join(staging, `${randomUUID()}.tmp`);
    try {
      const file = await open(tmp, "wx", 0o600);
      try {
        await file.writeFile(bytes);
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(tmp, join(directory, coverName(id)));
      await syncDirectory(covers);
      return (await coverInfo(directory, id))?.version ?? null;
    } finally {
      await rm(tmp, { force: true });
    }
  });
}
