import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import {
  editSan3Presets,
  presetFields,
  San3PresetDocument,
  san3MaximumPresetKey,
  san3PresetLayout,
} from "../../src/editors/san3/presets.ts";

/** Generated memory with structural instruction markers, not a copied game table. */
function fixture() {
  const bytes = new Uint8Array(0x80000).fill(0x47);
  const view = new DataView(bytes.buffer);
  view.setUint16(0x4abc4, 4);
  for (const offset of [0x58a04, 0x58d6a]) {
    view.setUint16(offset, 0x207c);
    view.setUint32(offset + 2, san3PresetLayout.offset);
  }
  view.setUint16(0x58a5e, 0x745a);
  view.setUint16(0x58a62, 0x7446);
  for (const [offset, word] of [
    [0x58d0e, 0x4a04],
    [0x58d10, 0x6700],
    [0x58d12, 0xff38],
    [0x58e02, 0x4a04],
    [0x58e04, 0x6600],
    [0x58e06, 0xfe44],
  ] as const)
    view.setUint16(offset, word);
  view.setUint16(0x58d1a, 0x0c32);
  view.setUint16(0x58d1c, 100);
  for (let index = 0; index < 24; index++) bytes[san3PresetLayout.offset + index] = 40 + index;
  return bytes;
}

function rowChanges(index: number, values: readonly number[]): Record<string, number> {
  return Object.fromEntries(
    san3PresetLayout.attributes.map((attribute, column) => [
      `preset.${index}.${attribute}`,
      values[column] ?? 0,
    ]),
  );
}

function maximumDraft() {
  return san3Adapter.view(fixture(), {}).actions[0]?.numericDefaults ?? {};
}

describe("Japanese Mega-CD creation defaults", () => {
  it("routes registration to defaults and preserves its canonical draft across records", () => {
    const bytes = fixture();
    const view = san3Adapter.view(bytes, {
      record: "2",
      changes: { "preset.0.land": 90, "preset.2.strength": 54 },
    });
    expect(
      view.modules.filter(({ unavailableReason }) => !unavailableReason).map(({ id }) => id),
    ).toEqual(["presets"]);
    expect(view.modules).toHaveLength(8);
    expect(view.records.map(({ cells }) => cells.bonus)).toEqual([90, 90, 70, 70]);
    expect(view.changes).toEqual({ "preset.0.land": 90 });
    expect(view.preview).toMatchObject([{ key: "preset.0.land", before: 40, after: 90 }]);
    expect(view.instructions).toEqual({ messageId: "san3.presetHelp" });
    expect(view.fields.every(({ help }) => help === undefined)).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/"(?:offset|width)":/);
    const edited = san3Adapter.apply(bytes, { changes: view.changes });
    expect(new San3PresetDocument(edited).values(0)[0]).toBe(90);
    expect(() => san3Adapter.apply(bytes, { changes: { "preset.0.land": 40 } })).toThrow(
      "editor.noChanges",
    );
    for (const draft of [
      { slot: 1 },
      { module: "cities" },
      { record: "04" },
      { record: "4" },
      { changes: { "city.0.gold": 50 } },
      { action: { id: "anything", record: "0" } },
    ]) {
      expect(() => san3Adapter.view(bytes, draft)).toThrow();
      expect(() => san3Adapter.apply(bytes, draft)).toThrow();
    }
  });

  it("owns buffers and exposes four six-attribute presets without requiring a scenario", () => {
    const input = fixture();
    const document = new San3PresetDocument(input);
    input.fill(0);
    expect(document.values(0)).toEqual([40, 41, 42, 43, 44, 45]);
    expect(document.values(3)).toEqual([58, 59, 60, 61, 62, 63]);
    expect(presetFields(document, 2)[0]).toMatchObject({
      key: "preset.2.land",
      value: 52,
      min: 1,
      max: 100,
      offset: 0x5d0b8,
      width: 1,
    });
    document.copy().fill(0);
    expect(document.values(0)[0]).toBe(40);
    for (const index of [-1, 4, 1.5, Number.NaN]) expect(() => document.values(index)).toThrow();
  });

  it("rejects other overlays, malformed tables and changed allocation routines", () => {
    expect(() => new San3PresetDocument(new Uint8Array(10))).toThrow();
    for (const offset of [
      0x4abc5, 0x58a04, 0x58a09, 0x58d6a, 0x58d6f, 0x58a5e, 0x58a62, 0x58d1a, 0x58d1d,
    ]) {
      const bytes = fixture();
      bytes[offset] = (bytes[offset] ?? 0) ^ 1;
      expect(() => new San3PresetDocument(bytes)).toThrow();
    }
    for (const value of [0, 101, 255]) {
      const bytes = fixture();
      bytes[san3PresetLayout.offset] = value;
      expect(() => new San3PresetDocument(bytes)).toThrow();
    }
    const full = fixture();
    full.fill(100, san3PresetLayout.offset, san3PresetLayout.offset + 6);
    expect(() => new San3PresetDocument(full)).toThrow();
  });

  it("keeps Node buffers independent during preview, publication and rejected drafts", () => {
    const input = Buffer.from(fixture());
    const original = Uint8Array.from(input);
    const document = new San3PresetDocument(input);
    const view = san3Adapter.view(input, { changes: { "preset.0.land": 90 } });
    const result = san3Adapter.apply(input, { changes: view.changes });
    expect(result[san3PresetLayout.offset]).toBe(90);
    expect(() =>
      san3Adapter.apply(input, { changes: { "preset.0.land": 90, "preset.1.naval": 101 } }),
    ).toThrow();
    expect(Uint8Array.from(input)).toEqual(original);
    input.fill(0);
    document.copy().fill(0);
    expect(document.values(0)[0]).toBe(40);
  });

  it("preserves all unrelated bytes and rejects an invalid draft atomically", () => {
    const input = fixture();
    const document = new San3PresetDocument(input);
    const result = editSan3Presets(document, { "preset.0.land": 95, "preset.3.charisma": 99 });
    expect(result.edits.map(({ before, after }) => [before, after])).toEqual([
      [40, 95],
      [63, 99],
    ]);
    const restored = result.bytes.slice();
    for (const { field, before } of result.edits) restored[field.offset] = before;
    expect(restored).toEqual(input);
    for (const changes of [
      { "preset.0.land": 90, "preset.4.land": 50 },
      { "preset.00.land": 50 },
      { "preset.0.unknown": 50 },
      { "officer.0.land": 50 },
      { "preset.0.land": 0 },
      { "preset.0.land": 101 },
      { "preset.0.land": 1.5 },
      { "preset.0.land": Number.NaN },
    ])
      expect(() => editSan3Presets(document, changes)).toThrow();
    expect(document.copy()).toEqual(input);
  });

  it("reserves the fixed point grant for every row and validates the final batch", () => {
    const document = new San3PresetDocument(fixture());
    for (let index = 0; index < 4; index++) {
      const values =
        index < 2 ? ([85, 85, 85, 85, 85, 85] as const) : ([90, 90, 90, 90, 90, 80] as const);
      const limit = new San3PresetDocument(
        editSan3Presets(document, rowChanges(index, values)).bytes,
      );
      expect(presetFields(limit, index)[0]?.max).toBe(values[0]);
      expect(() => editSan3Presets(limit, { [`preset.${index}.land`]: values[0] + 1 })).toThrow();
      const changes = {
        [`preset.${index}.land`]: values[0] + 1,
        [`preset.${index}.naval`]: values[1] - 1,
      };
      const result = editSan3Presets(limit, changes);
      const reverse = editSan3Presets(limit, Object.fromEntries(Object.entries(changes).reverse()));
      expect(result.bytes).toEqual(reverse.bytes);
      expect(new San3PresetDocument(result.bytes).values(index).slice(0, 2)).toEqual([
        values[0] + 1,
        values[1] - 1,
      ]);
    }
  });

  it("maximizes all rows with the exact zero-point confirmation patch", () => {
    const input = Buffer.from(fixture());
    const original = Uint8Array.from(input);
    const result = editSan3Presets(new San3PresetDocument(input), maximumDraft());
    const document = new San3PresetDocument(result.bytes);
    for (let index = 0; index < 4; index++) {
      expect(document.values(index)).toEqual([100, 100, 100, 100, 100, 100]);
      expect(document.bonus(index)).toBe(0);
      expect(presetFields(document, index).every(({ max }) => max === 100)).toBe(true);
    }
    expect(result.edits).toHaveLength(26);
    expect(result.changes).toEqual(maximumDraft());
    const changed = [...original.keys()].filter(
      (offset) => original[offset] !== result.bytes[offset],
    );
    expect(changed).toEqual([
      0x58a5f,
      0x58a63,
      0x58d12,
      0x58d13,
      ...Array.from({ length: 24 }, (_, index) => san3PresetLayout.offset + index),
    ]);
    expect(Uint8Array.from(input)).toEqual(original);
    expect(() => san3Adapter.apply(result.bytes, { changes: result.changes })).toThrow(
      "editor.noChanges",
    );
  });

  it("replays the complete maximum draft and overrides through the client filter", () => {
    const bytes = fixture();
    const first = san3Adapter.view(bytes, {
      changes: { ...maximumDraft(), "preset.0.land": 40 },
    });
    expect(first.changes["preset.0.land"]).toBeUndefined();
    expect(first.changes[san3MaximumPresetKey]).toBe(1);
    expect(previewedEditorChanges(first)).toEqual(first.changes);
    expect(first.preview.some(({ key }) => key === "preset.0.land")).toBe(false);
    expect(first.preview.filter(({ key }) => key.endsWith(".bonus"))).toMatchObject([
      { key: "preset.0.bonus", before: 90, after: 0 },
      { key: "preset.2.bonus", before: 70, after: 0 },
    ]);
    const second = san3Adapter.view(bytes, { record: "3", changes: previewedEditorChanges(first) });
    expect(second.changes).toEqual(first.changes);
    const edited = new San3PresetDocument(san3Adapter.apply(bytes, { changes: second.changes }));
    expect(edited.values(0)).toEqual([40, 100, 100, 100, 100, 100]);
    expect(edited.values(3)).toEqual([100, 100, 100, 100, 100, 100]);
    expect(second.records.map(({ cells }) => cells.bonus)).toEqual([0, 0, 0, 0]);
    const copied = san3Adapter.view(bytes, {
      record: "0",
      changes: { ...first.changes, "preset.0.land": 95 },
      action: { id: "copy-fields", record: "0", targets: ["1", "3"] },
    });
    const published = new San3PresetDocument(
      san3Adapter.apply(bytes, { changes: previewedEditorChanges(copied) }),
    );
    expect(published.values(1)[0]).toBe(95);
    expect(published.values(3)[0]).toBe(95);
    const reset = san3Adapter.view(bytes, { changes: { ...first.changes, ...maximumDraft() } });
    expect(reset.changes).toEqual(maximumDraft());
  });

  it("rejects partial code patches and malformed maximum drafts atomically", () => {
    const original = fixture();
    for (const offset of [0x58a5f, 0x58a63, 0x58d0f, 0x58d10, 0x58d12, 0x58e02, 0x58e04, 0x58e06]) {
      const bytes = original.slice();
      bytes[offset] = (bytes[offset] ?? 0) ^ 1;
      expect(() => new San3PresetDocument(bytes)).toThrow("editor.invalidSave");
    }
    const zeroOnly = original.slice();
    zeroOnly[0x58a5f] = zeroOnly[0x58a63] = 0;
    expect(() => new San3PresetDocument(zeroOnly)).toThrow("editor.invalidSave");
    for (const value of [0, 2, 0.5, Number.NaN])
      expect(() =>
        editSan3Presets(new San3PresetDocument(original), { [san3MaximumPresetKey]: value }),
      ).toThrow();
    expect(() =>
      editSan3Presets(new San3PresetDocument(original), {
        [san3MaximumPresetKey]: 1,
        "preset.0.land": 101,
      }),
    ).toThrow();
    expect(original).toEqual(fixture());
  });
});
