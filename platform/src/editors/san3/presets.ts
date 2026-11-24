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
export const san3MaximumPresetKey = "preset.maximum";

function maximumMode(view: DataView): boolean {
  const young = view.getUint16(0x58a5e);
  const older = view.getUint16(0x58a62);
  const branch = view.getUint16(0x58d12);
  if (young === 0x745a && older === 0x7446 && branch === 0xff38) return false;
  if (young === 0x7400 && older === 0x7400 && branch === 0x00f0) return true;
  throw invalidSave();
}

/** SETTEI's creation defaults are overlay RAM, not registered officers or native saves. */
export class San3PresetDocument {
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    if (bytes.length !== 0x80000) throw invalidSave();
    this.bytes = new Uint8Array(bytes);
    const view = new DataView(this.bytes.buffer);
    // Verify consumers, allocation cap and the existing zero-point confirmation path.
    if (
      view.getUint16(0x4abc4) !== 4 ||
      [0x58a04, 0x58d6a].some(
        (offset) =>
          view.getUint16(offset) !== 0x207c ||
          view.getUint32(offset + 2) !== san3PresetLayout.offset,
      ) ||
      view.getUint16(0x58d0e) !== 0x4a04 ||
      view.getUint16(0x58d10) !== 0x6700 ||
      view.getUint16(0x58e02) !== 0x4a04 ||
      view.getUint16(0x58e04) !== 0x6600 ||
      view.getUint16(0x58e06) !== 0xfe44 ||
      view.getUint16(0x58d1a) !== 0x0c32 ||
      view.getUint16(0x58d1c) !== 100
    )
      throw invalidSave();
    if (!validRows(this.bytes, maximumMode(view))) throw invalidSave();
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

  bonus(index: number): number {
    this.values(index);
    return maximumMode(new DataView(this.bytes.buffer)) ? 0 : (san3PresetLayout.bonus[index] ?? 0);
  }
}

function validRows(bytes: Uint8Array, maximum: boolean): boolean {
  return san3PresetLayout.bonus.every((bonus, index) => {
    const offset = san3PresetLayout.offset + index * san3PresetLayout.stride;
    const values = bytes.subarray(offset, offset + san3PresetLayout.stride);
    // Creation cannot finish until all granted points are spent; never strand them.
    return (
      values.every((value) => value >= 1 && value <= 100) &&
      values.reduce((total, value) => total + value, maximum ? 0 : bonus) <= 600
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
      max: Math.min(100, available + value - document.bonus(index)),
    };
  });
}

/** Validate the complete draft before returning a new buffer; native SRAM is not involved. */
export function editSan3Presets(document: San3PresetDocument, changes: Record<string, number>) {
  const maximum = Object.hasOwn(changes, san3MaximumPresetKey);
  if (maximum && changes[san3MaximumPresetKey] !== 1) throw invalidEdit();
  const baseline = document.copy();
  if (maximum) {
    baseline[0x58a5f] = 0;
    baseline[0x58a63] = 0;
    // Zero points originally loop forever; use the game's existing confirmation path.
    new DataView(baseline.buffer).setUint16(0x58d12, 0x00f0);
  }
  const modeChanged = maximum && document.bonus(0) !== 0;
  const canonical: Record<string, number> = modeChanged ? { [san3MaximumPresetKey]: 1 } : {};
  const bytes = baseline.slice();
  for (const [key, value] of Object.entries(changes)) {
    if (key === san3MaximumPresetKey) continue;
    const match = /^preset\.([0-3])\.([a-z]+)$/.exec(key);
    const field =
      match && presetFields(document, Number(match[1])).find((item) => item.key === key);
    // Descriptor maxima guide single-field inputs; a batch can redistribute capacity.
    if (!field || !Number.isSafeInteger(value) || value < 1 || value > 100) throw invalidEdit();
    bytes[field.offset] = value;
    if (value !== baseline[field.offset]) canonical[key] = value;
  }
  if (!validRows(bytes, maximumMode(new DataView(bytes.buffer)))) throw invalidEdit();
  const edits = Array.from({ length: 4 }, (_, index) => presetFields(document, index))
    .flat()
    .map((field) => ({ field, before: field.value, after: bytes[field.offset] ?? 0 }))
    .filter(({ before, after }) => before !== after);
  for (const index of [0, 2]) {
    const before = document.bonus(index);
    if (!maximum || before === 0) continue;
    const field: San3Field = {
      key: `preset.${index}.bonus`,
      label: message("san3.presetBonus"),
      group: message("san3.presetStats"),
      columnId: "bonus",
      value: before,
      min: 0,
      max: before,
      readonly: true,
      offset: index === 0 ? 0x58a5f : 0x58a63,
      width: 1,
    };
    edits.push({ field, before, after: 0 });
  }
  return { bytes, edits, modeChanged, changes: edits.length ? canonical : {} };
}
