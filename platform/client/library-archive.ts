import { unzipSync } from "fflate";
import { assertArtifactName } from "../src/domain/artifacts.ts";
import { dosExecutablePattern, gameUploadLimits } from "../src/domain/game-import.ts";
import { MessageError, message } from "../src/shared/messages.ts";

/** Suggestions only: inspect ZIP metadata without inflating game files; the server revalidates. */
export function inspectDosArchive(bytes: Uint8Array) {
  if (bytes.byteLength > gameUploadLimits.bytes)
    throw new MessageError(message("library.previewSize"));
  const names: string[] = [];
  let count = 0;
  let expanded = 0;
  unzipSync(bytes, {
    filter(entry) {
      if (++count > gameUploadLimits.files) throw new MessageError(message("library.archiveCount"));
      expanded += entry.originalSize;
      if (expanded > gameUploadLimits.expanded)
        throw new MessageError(message("library.previewExpandedSize"));
      const name = entry.name.replace(/\/$/, "");
      assertArtifactName(name);
      if (!entry.name.endsWith("/")) names.push(name);
      return false;
    },
  });
  return {
    files: names,
    executables: names.filter((name) => dosExecutablePattern.test(name)).sort(),
  };
}
