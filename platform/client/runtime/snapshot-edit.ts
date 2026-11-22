import type { RuntimeIdentity } from "../../src/domain/artifacts.ts";
import { MessageError, message } from "../../src/shared/messages.ts";
import type { Revision } from "../../src/storage/revisions.ts";
import { ApiError } from "../api.ts";
import { downloadVerified, verifyBytes } from "./progress.ts";
import type { RuntimeProgress } from "./types.ts";

export interface RuntimeSnapshotAccess {
  read(): Promise<RuntimeProgress>;
  /** Caller owns the pause; resolve only after observing the edited values in RAM. */
  replace(previous: RuntimeProgress, next: RuntimeProgress): Promise<void>;
}

function sameRuntime(left?: RuntimeIdentity, right?: RuntimeIdentity) {
  return (
    left !== undefined &&
    right !== undefined &&
    left.adapter === right.adapter &&
    left.core === right.core &&
    left.version === right.version
  );
}

/** Verify the complete paused capture before publication, including native SRAM. */
export async function prepareSnapshotEdit(access: RuntimeSnapshotAccess, original: Revision) {
  const stateName = "__runtime/state.bin";
  const source = original.manifest;
  const state = source.artifacts.find((file) => file.name === stateName);
  if (source.kind !== "snapshot" || !source.runtime || !state)
    throw new MessageError(message("runtime.snapshotMissing"));
  const captured = await access.read();
  const previous: RuntimeProgress = {
    ...captured,
    files: captured.files.map((file) => ({ ...file, bytes: new Uint8Array(file.bytes) })),
  };
  const names = new Set(previous.files.map((file) => file.name));
  if (
    previous.kind !== "snapshot" ||
    !sameRuntime(previous.runtime, source.runtime) ||
    names.size !== previous.files.length ||
    names.size !== source.artifacts.length ||
    new Set(source.artifacts.map((file) => file.name)).size !== source.artifacts.length
  )
    throw new MessageError(message("runtime.editRevisionMismatch"));
  for (const expected of source.artifacts) {
    const file = previous.files.find((entry) => entry.name === expected.name);
    if (!file) throw new MessageError(message("runtime.baseFileMissing"));
    try {
      await verifyBytes(file.bytes, expected);
    } catch {
      throw new ApiError("runtime_file_changed", 422, message("runtime.snapshotEditConflict"));
    }
  }
  let publishedId: string | undefined;
  return async (revision: Revision) => {
    const next = revision.manifest;
    if (
      revision.parentId !== original.id ||
      revision.profileId !== original.profileId ||
      next.releaseId !== source.releaseId ||
      revision.source !== "editor" ||
      next.kind !== "snapshot" ||
      !sameRuntime(next.runtime, source.runtime) ||
      (publishedId !== undefined && revision.id !== publishedId)
    )
      throw new MessageError(message("runtime.editRevisionMismatch"));
    if (
      next.artifacts.length !== source.artifacts.length ||
      new Set(next.artifacts.map((file) => file.name)).size !== next.artifacts.length
    )
      throw new MessageError(message("runtime.undeclaredChanges"));
    for (const before of source.artifacts) {
      const after = next.artifacts.find((file) => file.name === before.name);
      if (!after) throw new MessageError(message("runtime.editedFileMissing"));
      if (
        before.size !== after.size ||
        (before.name !== stateName && before.sha256 !== after.sha256)
      )
        throw new MessageError(message("runtime.undeclaredChanges"));
    }
    const edited = next.artifacts.find((file) => file.name === stateName);
    if (!edited || edited.sha256 === state.sha256)
      throw new MessageError(message("editor.noChanges"));
    publishedId = revision.id;
    const bytes = await downloadVerified(
      `/api/revisions/${revision.id}/file?name=${encodeURIComponent(stateName)}`,
      edited,
    );
    // Do not recapture on retry: the pending published revision is authoritative.
    await access.replace(previous, {
      ...previous,
      files: previous.files.map((file) => (file.name === stateName ? { ...file, bytes } : file)),
    });
  };
}
