import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import type { San3Field } from "./fields.ts";

export const san3PresetLayout = {
  offset: 0x5d0ac,
  count: 4,
  stride: 6,
  attributes: ["land", "naval", "strength", "intelligence", "politics", "charisma"],
  bonus: [90, 90, 70, 70],
} as const;

const invalidSave = () => new EditorError("invalid_save", message("editor.invalidSave"));
const invalidEdit = () => new EditorError("invalid_edit", message("editor.invalidEdit"));

/** SETTEI's creation defaults are overlay RAM, not registered officers or native saves. */
export class San3PresetDocument {
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    if (bytes.length !== 0x80000) throw invalidSave();
    this.bytes = new Uint8Array(bytes);
    const view = new DataView(this.bytes.buffer);
    // Verify both table consumers, the fixed point grants and the allocation cap.
    if (
      view.getUint16(0x4abc4) !== 4 ||
      [0x58a04, 0x58d6a].some(
        (offset) =>
          view.getUint16(offset) !== 0x207c ||
          view.getUint32(offset + 2) !== san3PresetLayout.offset,
      ) ||
      view.getUint16(0x58a5e) !== 0x745a ||
      view.getUint16(0x58a62) !== 0x7446 ||
      view.getUint16(0x58d1a) !== 0x0c32 ||
      view.getUint16(0x58d1c) !== 100
    )
      throw invalidSave();
    if (!validRows(this.bytes)) throw invalidSave();
  }

  values(index: number): number[] {
    if (!Number.isInteger(index) || index < 0 || index >= san3PresetLayout.count)
      throw invalidEdit();
    const offset = san3PresetLayout.offset + index * san3PresetLayout.stride;
    return [...this.bytes.subarray(offset, offset + san3PresetLayout.stride)];
  }

  copy(): Uint8Array {
    return this.bytes.slice();
  }
}

function validRows(bytes: Uint8Array): boolean {
  return san3PresetLayout.bonus.every((bonus, index) => {
    const offset = san3PresetLayout.offset + index * san3PresetLayout.stride;
    const values = bytes.subarray(offset, offset + san3PresetLayout.stride);
    // Creation cannot finish until all granted points are spent; never strand them.
    return (
      values.every((value) => value >= 1 && value <= 100) &&
      values.reduce((total, value) => total + value, bonus) <= 600
    );
  });
}

export function presetFields(document: San3PresetDocument, index: number): San3Field[] {
  const values = document.values(index);
  const available = values.reduce((remaining, value) => remaining - value, 600);
  return san3PresetLayout.attributes.map((id, attribute) => {
    const value = values[attribute] ?? 0;
    return {
      key: `preset.${index}.${id}`,
      label: message(`san3.${id}`),
      group: message("san3.presetStats"),
      columnId: id,
      offset: san3PresetLayout.offset + index * san3PresetLayout.stride + attribute,
      width: 1,
      value,
      min: 1,
      max: Math.min(100, available + value - (san3PresetLayout.bonus[index] ?? 0)),
    };
  });
}

/** Validate the complete draft before returning a new buffer; native SRAM is not involved. */
export function editSan3Presets(document: San3PresetDocument, changes: Record<string, number>) {
  const edits = Object.entries(changes).map(([key, value]) => {
    const match = /^preset\.([0-3])\.([a-z]+)$/.exec(key);
    const field =
      match && presetFields(document, Number(match[1])).find((item) => item.key === key);
    // Descriptor maxima guide single-field inputs; a batch can redistribute capacity.
    if (!field || !Number.isSafeInteger(value) || value < 1 || value > 100) throw invalidEdit();
    return { field, before: field.value, after: value };
  });
  const bytes = document.copy();
  for (const { field, after } of edits) bytes[field.offset] = after;
  if (!validRows(bytes)) throw invalidEdit();
  return { bytes, edits };
}
