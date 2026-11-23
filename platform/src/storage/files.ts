import type { Stats } from "node:fs";
import { lstat, open, realpath, type unlink } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { assertArtifactName } from "../domain/artifacts.ts";

export async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === "win32") return;
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function removeOwnedFile(root: string, name: string, remove: typeof unlink) {
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
