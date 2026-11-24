import { message } from "../../shared/messages.ts";
import type { EditorField } from "../types.ts";
import type { San3Document } from "./document.ts";
import { invalidGovernance } from "./governance-core.ts";
import { san3OperationPreview } from "./operation-preview.ts";

const iconLabel = (value: number) =>
  value === 24
    ? message("san3.factionIconNeutral")
    : message("san3.factionIconNumber", { index: value + 1 });

/** Native small/large symbol tables contain 25 images; the last is the neutral symbol. */
export function san3FactionIconFields(document: San3Document, index: number): EditorField[] {
  document.faction(index);
  return [
    {
      key: `factionIcon.${index}.symbol`,
      columnId: "factionIcon",
      label: message("san3.factionIcon"),
      group: message("san3.factionContext"),
      help: message("san3.factionIconHelp"),
      value: document.read(0x7878c + index, 1),
      min: 0,
      max: 24,
      choices: Array.from({ length: 25 }, (_, value) => ({ value, label: iconLabel(value) })),
    },
  ];
}

/** Symbols belong to faction slots. Duplicates neither merge factions nor change control. */
export function editSan3FactionIcon(document: San3Document, changes: Record<string, number>) {
  const bytes = document.copy();
  const intents: Record<string, number> = {};
  const writes: { offset: number; width: 1; before: number; after: number }[] = [];
  const { append, preview } = san3OperationPreview();
  for (const [key, value] of Object.entries(changes)) {
    const match = /^factionIcon\.(0|[1-9]\d?)\.symbol$/.exec(key);
    if (!match || !Number.isInteger(value) || value < 0 || value > 24) throw invalidGovernance();
    const index = Number(match[1]);
    document.faction(index);
    const offset = 0x7878c + index;
    const before = document.read(offset, 1);
    if (value === before) continue;
    bytes[offset] = value;
    intents[key] = value;
    writes.push({ offset, width: 1, before, after: value });
    append(
      key,
      message("san3.factionRecord", { index: index + 1 }),
      "factionIcon",
      iconLabel(before),
      iconLabel(value),
    );
  }
  return { bytes, changes: intents, preview, writes: writes.sort((a, b) => a.offset - b.offset) };
}
