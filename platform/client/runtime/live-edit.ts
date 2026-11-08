import { MessageError, message } from "../../src/shared/messages.ts";
import type { Revision } from "../../src/storage/revisions.ts";
import { ApiError } from "../api.ts";
import { downloadVerified, verifyBytes } from "./progress.ts";
import type { RuntimeFileAccess } from "./types.ts";

/** Preflight before publishing, retaining original bytes for a guarded writeback. */
export async function prepareLiveEdit(files: RuntimeFileAccess, original: Revision, name: string) {
  const source = original.manifest.artifacts.find((file) => file.name === name);
  if (!source) throw new MessageError(message("runtime.baseFileMissing"));
  const previous = await files.read(name);
  try {
    await verifyBytes(previous, source);
  } catch {
    throw new ApiError("runtime_file_changed", 422, message("runtime.editConflict"));
  }
  return async (revision: Revision) => {
    if (
      revision.parentId !== original.id ||
      revision.profileId !== original.profileId ||
      revision.manifest.releaseId !== original.manifest.releaseId ||
      revision.source !== "editor"
    )
      throw new MessageError(message("runtime.editRevisionMismatch"));
    const target = revision.manifest.artifacts.find((file) => file.name === name);
    if (!target) throw new MessageError(message("runtime.editedFileMissing"));
    const bytes = await downloadVerified(
      `/api/revisions/${revision.id}/file?name=${encodeURIComponent(name)}`,
      target,
    );
    await files.replace([{ name, previous, bytes }]);
  };
}
