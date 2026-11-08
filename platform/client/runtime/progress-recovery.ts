import type { Profile, Revision } from "../../src/storage/revisions.ts";
import { ApiError, api } from "../api.ts";
import { verifyBytes } from "./progress.ts";
import { publishProgress } from "./progress-sync.ts";
import type { RuntimeProgress } from "./types.ts";

async function matches(progress: RuntimeProgress, revision: Revision, releaseId: string) {
  const manifest = revision.manifest;
  if (
    manifest.kind !== progress.kind ||
    manifest.releaseId !== releaseId ||
    manifest.artifacts.length !== progress.files.length
  )
    return false;
  for (const key of ["adapter", "core", "version"] as const)
    if (manifest.runtime?.[key] !== progress.runtime?.[key]) return false;
  for (const file of progress.files) {
    const expected = manifest.artifacts.find((artifact) => artifact.name === file.name);
    if (!expected) return false;
    try {
      await verifyBytes(file.bytes, expected);
    } catch {
      return false;
    }
  }
  return true;
}

/** Retain the same target and immutable capture across retries, including lost responses. */
export function createProgressRecovery(releaseId: string, name: string, progress: RuntimeProgress) {
  let target: Profile | null = null;
  return async (): Promise<Profile> => {
    target ??= await api<Profile>("profiles", { releaseId, name });
    let saved: Revision;
    try {
      saved = await publishProgress(target.id, releaseId, null, progress);
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.status !== 409) throw cause;
      const history = await api<Revision[]>(`profiles/${target.id}/revisions`);
      const existing = history[0];
      if (!existing || !(await matches(progress, existing, releaseId))) throw cause;
      saved = existing; // The prior attempt committed but its response was lost.
    }
    return { ...target, headId: saved.id };
  };
}
