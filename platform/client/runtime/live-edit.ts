import { MessageError, message } from "../../src/shared/messages.ts";
import type { Revision } from "../../src/storage/revisions.ts";
import { ApiError } from "../api.ts";
import { downloadVerified, verifyBytes } from "./progress.ts";
import type { RuntimeFileAccess, RuntimeReplacement } from "./types.ts";

/** Preflight before publishing, retaining original bytes for a guarded writeback. */
export async function prepareLiveEdit(
  files: RuntimeFileAccess,
  original: Revision,
  names: readonly string[],
) {
  if (
    !names.length ||
    new Set(names.map((name) => name.normalize("NFC").toLowerCase())).size !== names.length
  )
    throw new MessageError(message("runtime.invalidFileGroup"));
  const originals = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const name of names) {
    const source = original.manifest.artifacts.find((file) => file.name === name);
    if (!source) throw new MessageError(message("runtime.baseFileMissing"));
    const previous = await files.read(name);
    try {
      await verifyBytes(previous, source);
    } catch {
      throw new ApiError("runtime_file_changed", 422, message("runtime.editConflict"));
    }
    originals.set(name, previous);
  }
  return async (revision: Revision) => {
    if (
      revision.parentId !== original.id ||
      revision.profileId !== original.profileId ||
      revision.manifest.releaseId !== original.manifest.releaseId ||
      revision.source !== "editor" ||
      revision.manifest.kind !== original.manifest.kind
    )
      throw new MessageError(message("runtime.editRevisionMismatch"));
    for (const source of original.manifest.artifacts) {
      const target = revision.manifest.artifacts.find((file) => file.name === source.name);
      if (!target) throw new MessageError(message("runtime.editedFileMissing"));
      if (
        !originals.has(source.name) &&
        (source.sha256 !== target.sha256 || source.size !== target.size)
      )
        throw new MessageError(message("runtime.undeclaredChanges"));
    }
    if (revision.manifest.artifacts.length !== original.manifest.artifacts.length)
      throw new MessageError(message("runtime.undeclaredChanges"));
    const replacements: RuntimeReplacement[] = [];
    // Download and verify all members before allowing the first runtime write.
    for (const target of revision.manifest.artifacts) {
      const previous = originals.get(target.name);
      if (!previous) continue;
      const bytes = await downloadVerified(
        `/api/revisions/${revision.id}/file?name=${encodeURIComponent(target.name)}`,
        target,
      );
      replacements.push({ name: target.name, previous, bytes });
    }
    await files.replace(replacements);
  };
}
