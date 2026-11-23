import { createHash } from "node:crypto";
import type { Game, LocalLibrary } from "../library/catalog.ts";
import { message } from "../shared/messages.ts";
import type { EditorRegistration } from "./registry.ts";
import { EditorError } from "./types.ts";

/** Read only an authorized revision's immutable release, bounded by installed adapter policy. */
export async function bindGameData(
  library: LocalLibrary,
  game: Game,
  registration: EditorRegistration,
) {
  const binding = registration.gameData;
  if (!binding || game.size > binding.maxBytes) return registration.adapter;
  const invalid = () => new EditorError("unsupported_editor", message("editor.unsupported"));
  const stream = library.stream(game.id);
  if (!stream) throw invalid();
  const chunks: Buffer[] = [];
  const hash = createHash("sha256");
  let size = 0;
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > binding.maxBytes || size > game.size) throw invalid();
      chunks.push(chunk);
      hash.update(chunk);
    }
    if (size !== game.size || hash.digest("hex") !== game.sha256) throw invalid();
    return binding.bind(Buffer.concat(chunks, size));
  } finally {
    stream.destroy();
  }
}
