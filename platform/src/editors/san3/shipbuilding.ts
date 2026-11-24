import { message } from "../../shared/messages.ts";
import { EditorError, type EditorField } from "../types.ts";
import type { San3Document } from "./document.ts";
import { san3ListContext } from "./list-context.ts";
import { san3OperationLabels, san3OperationPreview } from "./operation-preview.ts";

const queues = [
  { id: "heavy", label: "shipbuildingHeavy", shift: 0, mask: 7 },
  { id: "medium", label: "shipbuildingMedium", shift: 3, mask: 7 },
  { id: "light", label: "shipbuildingLight", shift: 6, mask: 3 },
] as const;
const invalid = () => new EditorError("invalid_edit", message("editor.invalidEdit"));

function editable(document: San3Document, index: number): boolean {
  const base = document.offset("cities", index);
  const city = san3ListContext(document).cities[index];
  // Native completion adds stock in the human, nondelegated monthly report path.
  return (
    city !== undefined &&
    city.faction !== 255 &&
    city.serving.length > 0 &&
    (document.read(base + 21, 1) & 128) !== 0 &&
    (document.read(base + 23, 1) & 3) === 0 &&
    document.read(0x7dc0a + city.faction, 1) !== 0 &&
    queues.every((_, queue) => document.read(base + 43 + queue, 1) <= 100)
  );
}

/** Three independent port queues; zero cancels, while native monthly settlement completes them. */
export function san3ShipbuildingFields(document: San3Document, index: number): EditorField[] {
  try {
    if (!editable(document, index)) return [];
    const packed = document.read(document.offset("cities", index) + 42, 1);
    return queues.map(({ id, label, shift, mask }) => ({
      key: `shipbuilding.${index}.${id}`,
      columnId: id,
      label: message(`san3.${label}`),
      group: message("san3.shipbuilding"),
      ...(id === "heavy" ? { help: message("san3.shipbuildingHelp") } : {}),
      value: (packed >> shift) & mask,
      min: 0,
      max: mask,
    }));
  } catch {
    return [];
  }
}

/** Editor policy: creating a queue is free and does not consume an officer's action. */
export function editSan3Shipbuilding(document: San3Document, changes: Record<string, number>) {
  const bytes = document.copy();
  const names = san3OperationLabels(document);
  const { append, preview } = san3OperationPreview();
  const intents: Record<string, number> = {};
  const offsets = new Set<number>();
  const inspected = new Set<number>();
  for (const [key, value] of Object.entries(changes)) {
    const match = /^shipbuilding\.(0|[1-9]\d?)\.(heavy|medium|light)$/.exec(key);
    if (!match || !Number.isSafeInteger(value)) throw invalid();
    const index = Number(match[1]);
    const queue = queues.find(({ id }) => id === match[2]);
    if (!queue || value < 0 || value > queue.mask) throw invalid();
    if (!inspected.has(index)) {
      if (!editable(document, index)) throw invalid();
      inspected.add(index);
    }
    const offset = document.offset("cities", index) + 42;
    const before = (document.read(offset, 1) >> queue.shift) & queue.mask;
    if (before === value) continue;
    bytes[offset] =
      ((bytes[offset] as number) & ~(queue.mask << queue.shift)) | (value << queue.shift);
    offsets.add(offset);
    intents[key] = value;
    append(key, names.city(index), queue.label, before, value);
  }
  return {
    bytes,
    changes: intents,
    preview,
    writes: [...offsets]
      .sort((a, b) => a - b)
      .map((offset) => ({
        offset,
        width: 1 as const,
        before: document.read(offset, 1),
        after: bytes[offset] as number,
      })),
  };
}
