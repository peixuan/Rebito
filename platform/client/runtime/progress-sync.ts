import type { Revision } from "../../src/storage/revisions.ts";
import { api } from "../api.ts";
import { verifyBytes } from "./progress.ts";
import type { RuntimeProgress } from "./types.ts";

/** Archive metadata can change without a game save; automatic publication tracks native files. */
export async function nativeProgressChanged(progress: RuntimeProgress, revision: Revision | null) {
  const native = progress.files.filter((file) => !file.name.startsWith("__runtime/"));
  const previous =
    revision?.manifest.artifacts.filter((file) => !file.name.startsWith("__runtime/")) ?? [];
  if (native.length !== previous.length) return true;
  for (const file of native) {
    const expected = previous.find((entry) => entry.name === file.name);
    if (!expected) return true;
    try {
      await verifyBytes(file.bytes, expected);
    } catch {
      return true;
    }
  }
  return false;
}

export function publishProgress(
  profileId: string,
  releaseId: string,
  baseRevision: string | null,
  progress: RuntimeProgress,
) {
  const body = new FormData();
  body.append(
    "metadata",
    JSON.stringify({
      kind: progress.kind,
      runtime: progress.runtime,
      releaseId,
      baseRevision,
    }),
  );
  for (const file of progress.files) body.append("file", new Blob([file.bytes]), file.name);
  return api<Revision>(`profiles/${profileId}/revisions`, body);
}
