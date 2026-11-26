import type { Revision } from "../../src/storage/revisions.ts";
import { ApiError, api } from "../api.ts";
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

export async function publishProgress(
  profileId: string,
  releaseId: string,
  baseRevision: string | null,
  progress: RuntimeProgress,
  backup = false,
) {
  const body = new FormData();
  body.append(
    "metadata",
    JSON.stringify({
      kind: progress.kind,
      runtime: progress.runtime,
      releaseId,
      baseRevision,
      ...(backup ? { backup: true } : {}),
    }),
  );
  for (const file of progress.files) body.append("file", new Blob([file.bytes]), file.name);
  return uploadProgress(profileId, body);
}

/** Shared by runtime captures and explicit file imports. Never recapture on retry. */
export async function uploadProgress(profileId: string, body: FormData): Promise<Revision> {
  const started = performance.now();
  for (let attempt = 0; ; attempt++) {
    try {
      return await api<Revision>(`profiles/${profileId}/revisions`, body);
    } catch (error) {
      // A transport error can hide a committed revision. Only retry an explicit
      // pre-publication rejection, reusing this capture and its original base.
      if (!(error instanceof ApiError) || error.status !== 503 || error.message !== "upload_busy")
        throw error;
      const retryAfter = Number.isFinite(error.retryAfterMs) ? Math.max(0, error.retryAfterMs) : 0;
      const delay = Math.max(retryAfter, Math.min(1000 * 2 ** attempt, 8000)) + Math.random() * 250;
      if (attempt >= 4 || performance.now() - started + delay > 60_000)
        throw new ApiError("save_queue_timeout", 503);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
