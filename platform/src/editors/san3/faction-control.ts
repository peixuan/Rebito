import { message } from "../../shared/messages.ts";
import type { EditorField } from "../types.ts";
import type { San3Document } from "./document.ts";
import { invalidGovernance } from "./governance-core.ts";
import { san3OperationLabels, san3OperationPreview } from "./operation-preview.ts";

function control(document: San3Document, index: number): number {
  if (!document.faction(index).active) throw invalidGovernance();
  return document.read(0x7dc0a + index, 1) ? 1 : 0;
}

/** Human/computer control is a persistent per-faction flag, independent of its ruler. */
export function san3FactionControlFields(document: San3Document, index: number): EditorField[] {
  const value = document.read(0x7dc0a + document.faction(index).index, 1);
  return [
    {
      key: `factionControl.${index}.human`,
      columnId: "factionControl",
      label: message("san3.factionControl"),
      group: message("san3.factionContext"),
      help: message("san3.factionControlHelp"),
      value: value ? 1 : 0,
      min: 0,
      max: 1,
      readonly: !document.faction(index).active,
      choices: [0, 1].map((value) => ({ value, label: message(`san3.factionControl${value}`) })),
    },
  ];
}

/** Native command dispatch reads this flag again; never rewrite the current turn queue. */
export function editSan3FactionControl(document: San3Document, changes: Record<string, number>) {
  const bytes = document.copy();
  const names = san3OperationLabels(document);
  const { append, preview } = san3OperationPreview();
  const intents: Record<string, number> = {};
  const writes: { offset: number; width: 1; before: number; after: number }[] = [];
  for (const [key, value] of Object.entries(changes)) {
    const match = /^factionControl\.(0|[1-9]\d?)\.human$/.exec(key);
    if (!match || (value !== 0 && value !== 1)) throw invalidGovernance();
    const index = Number(match[1]);
    const before = control(document, index);
    if (before === value) continue;
    const offset = 0x7dc0a + index;
    bytes[offset] = value;
    writes.push({ offset, width: 1, before: document.read(offset, 1), after: value });
    intents[key] = value;
    append(
      key,
      names.faction(index),
      "factionControl",
      message(`san3.factionControl${before}`),
      message(`san3.factionControl${value}`),
    );
  }
  return { bytes, changes: intents, preview, writes: writes.sort((a, b) => a.offset - b.offset) };
}
