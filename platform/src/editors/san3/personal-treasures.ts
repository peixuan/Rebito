import { message } from "../../shared/messages.ts";
import { EditorError, type EditorField } from "../types.ts";
import type { San3Document } from "./document.ts";
import { san3OperationLabels } from "./operation-preview.ts";
import { san3TreasureName } from "./treasures.ts";

/** Personal possession flags do not allocate, transfer or discover global treasures. */
export function san3PersonalTreasureFields(document: San3Document, index: number): EditorField[] {
  const mask = document.read(document.offset("officers", index) + 4, 2);
  return Array.from({ length: 12 }, (_, n) => {
    const item = n + 1;
    return {
      key: `personalTreasure.${index}.${item}`,
      columnId: `personalTreasure${item}`,
      label:
        san3TreasureName(document, item) || message("san3.treasureRecord", { index: item + 1 }),
      group: message("san3.personalTreasures"),
      ...(item === 1 ? { help: message("san3.personalTreasureHelp") } : {}),
      value: (mask >>> item) & 1,
      min: 0,
      max: 1,
      boolean: true,
    };
  });
}

/** The game's ordinary bonuses read these bits directly, without a unique-owner lookup. */
export function editSan3PersonalTreasures(document: San3Document, draft: Record<string, number>) {
  const bytes = document.copy();
  const data = new DataView(bytes.buffer);
  const names = san3OperationLabels(document);
  const changes: Record<string, number> = {};
  const preview = [];
  const touched = new Set<number>();
  for (const [key, value] of Object.entries(draft)) {
    const match = /^personalTreasure\.(0|[1-9]\d{0,2})\.([1-9]|1[0-2])$/.exec(key);
    if (!match || (value !== 0 && value !== 1))
      throw new EditorError("invalid_edit", message("editor.invalidEdit"));
    const index = Number(match[1]);
    const item = Number(match[2]);
    const offset = document.offset("officers", index) + 4;
    const before = (document.read(offset, 2) >>> item) & 1;
    if (before === value) continue;
    const mask = data.getUint16(offset);
    data.setUint16(offset, value ? mask | (1 << item) : mask & ~(1 << item));
    changes[key] = value;
    touched.add(offset);
    preview.push({
      key,
      label: message("editor.columnLabel", {
        group: names.officer(index),
        field:
          san3TreasureName(document, item) || message("san3.treasureRecord", { index: item + 1 }),
      }),
      before,
      after: value,
    });
  }
  const writes = [...touched]
    .sort((a, b) => a - b)
    .map((offset) => ({
      offset,
      width: 2 as const,
      before: document.read(offset, 2),
      after: data.getUint16(offset),
    }));
  return { bytes, changes, preview, writes };
}
