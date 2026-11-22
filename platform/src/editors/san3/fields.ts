import { message } from "../../shared/messages.ts";
import { EditorError, type EditorField } from "../types.ts";
import type { San3Document } from "./document.ts";

export interface San3Field extends EditorField {
  offset: number;
  width: 1 | 2 | 4;
}

/** Population is stored in hundreds; the shared multiplier presents people. */
export function cityFields(document: San3Document, index: number): San3Field[] {
  const offset = document.offset("cities", index);
  return (
    [
      ["population", 0x0c, 2, 30_000],
      ["gold", 0x0e, 2, 50_000],
      ["food", 0x10, 4, 3_000_000],
    ] as const
  ).map(([id, relative, width, max]) => ({
    key: `city.${index}.${id}`,
    label: message(`san3.${id}`),
    group: message("san3.resources"),
    columnId: id,
    offset: offset + relative,
    width,
    value: document.read(offset + relative, width),
    min: 0,
    max,
    ...(id === "population" ? { multiplier: 100 } : {}),
  }));
}

export function officerFields(document: San3Document, index: number): San3Field[] {
  const officer = document.officer(index);
  const offset = document.offset("officers", index);
  return (
    [
      ["soldiers", 2, 2, officer.soldierLimit],
      ["loyalty", 0x0f, 1, 100],
      ["training", 0x15, 1, 100],
      ["morale", 0x16, 1, 100],
    ] as const
  ).map(([id, relative, width, max]) => ({
    key: `officer.${index}.${id}`,
    label: message(`san3.${id}`),
    group: message("san3.officer"),
    columnId: id,
    offset: offset + relative,
    width,
    value: document.read(offset + relative, width),
    min: id === "soldiers" && officer.soldiers > 0 ? 1 : 0,
    max,
    // Disband/recruit and ruler loyalty involve additional state, not just a number.
    readonly:
      !officer.available || (id === "loyalty" ? officer.role === 0 : officer.soldiers === 0),
  }));
}

export function findSan3Field(document: San3Document, key: string): San3Field {
  const match = /^(city|officer)\.(0|[1-9]\d{0,2})\./.exec(key);
  if (match) {
    const index = Number(match[2]);
    const fields =
      match[1] === "city" ? cityFields(document, index) : officerFields(document, index);
    const field = fields.find((candidate) => candidate.key === key);
    if (field) return field;
  }
  throw new EditorError("invalid_edit", message("editor.invalidEdit"));
}

/** Validate the whole request before copying; no pointer, name or table edits. */
export function editSan3(document: San3Document, changes: Record<string, number>) {
  const edits = Object.entries(changes).map(([key, value]) => {
    const field = findSan3Field(document, key);
    if (field.readonly || !Number.isSafeInteger(value) || value < field.min || value > field.max)
      throw new EditorError("invalid_edit", message("editor.invalidEdit"));
    return { field, before: field.value, after: value };
  });
  const bytes = document.copy();
  const data = new DataView(bytes.buffer);
  for (const { field, after } of edits) {
    if (field.width === 1) data.setUint8(field.offset, after);
    else if (field.width === 2) data.setUint16(field.offset, after);
    else data.setUint32(field.offset, after);
  }
  return { bytes, edits };
}
