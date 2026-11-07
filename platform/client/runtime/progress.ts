import type { ArtifactRef, RuntimeIdentity } from "../../src/domain/artifacts.ts";
import type { Game } from "../../src/library/catalog.ts";
import { MessageError, message } from "../../src/shared/messages.ts";
import type { Revision } from "../../src/storage/revisions.ts";
import { ApiError } from "../api.ts";
import type { RuntimeProgress } from "./types.ts";

/** Verify the selected immutable bytes again at the browser/runtime boundary. */
export async function downloadVerified(
  path: string,
  expected: Pick<ArtifactRef, "size" | "sha256">,
) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new ApiError("download_failed", response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hash = [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
  if (bytes.length !== expected.size || hash !== expected.sha256)
    throw new MessageError(message("runtime.integrity"));
  return bytes;
}

export function assertCompatible(game: Game, revision: Revision, runtime: RuntimeIdentity): void {
  if (revision.manifest.releaseId !== game.id)
    throw new MessageError(message("runtime.releaseMismatch"));
  if (revision.manifest.kind === "snapshot") {
    const saved = revision.manifest.runtime;
    if (
      !saved ||
      saved.adapter !== runtime.adapter ||
      saved.core !== runtime.core ||
      saved.version !== runtime.version
    ) {
      throw new MessageError(message("runtime.snapshotMismatch"));
    }
  }
}

export async function downloadProgress(revision: Revision): Promise<RuntimeProgress> {
  const files = await Promise.all(
    revision.manifest.artifacts.map(async (file) => ({
      name: file.name,
      bytes: await downloadVerified(
        `/api/revisions/${revision.id}/file?name=${encodeURIComponent(file.name)}`,
        file,
      ),
    })),
  );
  return {
    kind: revision.manifest.kind,
    files,
    ...(revision.manifest.runtime ? { runtime: revision.manifest.runtime } : {}),
  };
}
