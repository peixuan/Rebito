import { message } from "../../shared/messages.ts";
import { type EditorDraft, EditorError } from "../types.ts";
import { expandSan3Batch, type San3BatchKind } from "./batch.ts";
import type { San3Document } from "./document.ts";
import type { San3PresetDocument } from "./presets.ts";

/** A preview expands the action once; publication receives only canonical numeric intents. */
export function san3BatchDraft(
  document: San3Document | San3PresetDocument,
  draft: EditorDraft,
  kind: San3BatchKind,
) {
  const changes = draft.changes ?? {};
  if (!draft.action) return changes;
  const { id, record, targets } = draft.action;
  if (id !== "copy-fields" || !targets || (draft.record !== undefined && draft.record !== record))
    throw new EditorError("invalid_edit", message("editor.invalidEdit"));
  const index = (value: string) => {
    if (!/^(0|[1-9]\d{0,2})$/.test(value))
      throw new EditorError("invalid_edit", message("editor.invalidEdit"));
    return Number(value);
  };
  return expandSan3Batch(document, changes, kind, index(record), targets.map(index));
}
