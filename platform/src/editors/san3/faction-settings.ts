import { message } from "../../shared/messages.ts";
import { EditorError, type EditorView } from "../types.ts";
import { editSan3Diplomacy } from "./diplomacy.ts";
import { San3Document } from "./document.ts";
import { editSan3FactionControl } from "./faction-control.ts";
import { editSan3FactionIcon } from "./faction-icon.ts";
import { editSan3TurnOrder } from "./turn-order.ts";

const handlers = [
  { prefix: "factionControl.", edit: editSan3FactionControl },
  { prefix: "factionIcon.", edit: editSan3FactionIcon },
  { prefix: "diplomacy.", edit: editSan3Diplomacy },
  { prefix: "turnOrder.", edit: editSan3TurnOrder },
];

/** Independent faction settings share an atomic draft; ownership transitions stay separate. */
export function san3FactionSettingsWorkflow(document: San3Document, draft: Record<string, number>) {
  const entries = Object.entries(draft);
  const supported = (key: string) => handlers.some(({ prefix }) => key.startsWith(prefix));
  if (!entries.some(([key]) => supported(key))) return undefined;
  if (entries.some(([key]) => !supported(key)))
    throw new EditorError("invalid_edit", message("san3.separateWorkflow"));
  let current = document;
  const operationChanges: Record<string, number> = {};
  const operationPreview: EditorView["preview"] = [];
  for (const { prefix, edit } of handlers) {
    const changes = Object.fromEntries(entries.filter(([key]) => key.startsWith(prefix)));
    if (!Object.keys(changes).length) continue;
    const result = edit(current, changes);
    current = new San3Document(result.bytes);
    Object.assign(operationChanges, result.changes);
    operationPreview.push(...result.preview);
  }
  return { bytes: current.copy(), edits: [], operationChanges, operationPreview };
}
