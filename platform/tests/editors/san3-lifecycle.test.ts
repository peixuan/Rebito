import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { editSan3Lifecycle, lifecycleFields } from "../../src/editors/san3/lifecycle.ts";

const officer = san3Layout.officers.offset;

/** Synthetic strategic records; none of the byte values come from player progress. */
function fixture() {
  const bytes = new Uint8Array(san3Layout.size);
  const data = new DataView(bytes.buffer);
  data.setUint32(0x78000, 0x4b4f4549);
  data.setUint32(0x78776, 0x4b4f4549);
  data.setUint16(0x78788, 200);
  for (let index = 0; index < 21; index++)
    data.setUint16(san3Layout.factions.offset + index * 50, 0xffff);
  data.setUint16(san3Layout.factions.offset, 0);
  data.setUint32(san3Layout.factions.offset + 2, san3Layout.cities.offset);
  for (let index = 0; index < 46; index++) {
    const city = san3Layout.cities.offset + index * 52;
    for (const relative of [4, 6, 8, 10]) data.setUint16(city + relative, 0xffff);
    bytes[city + 20] = index === 0 ? 0 : 255;
  }
  bytes[officer + 8] = 0xa1;
  bytes[officer + 9] = 0xad;
  bytes[officer + 11] = 0xeb;
  bytes[officer + 12] = 3;
  bytes[officer + 19] = 1;
  bytes[officer + 20] = 21;
  bytes[123] = 219;
  return bytes;
}

describe("SAN3 constrained strategic lifecycle transitions", () => {
  it("offers explicit cleanup and a separate bounded turncoat counter", () => {
    const fields = lifecycleFields(new San3Document(fixture()), 0);
    expect(
      fields.map(({ columnId, value, max, readonly }) => [columnId, value, max, readonly]),
    ).toEqual([
      ["finishRecovery", 0, 1, false],
      ["turncoatMonths", 2, 3, false],
      ["endInfiltration", 0, 1, false],
    ]);
    expect(fields.every((field) => !("offset" in field))).toBe(true);
  });

  it("clears recovery state and composes adjacent countdown edits in either order", () => {
    const original = fixture();
    const changes = { "lifecycle.0.finishRecovery": 1, "lifecycle.0.turncoatMonths": 3 };
    const result = editSan3Lifecycle(new San3Document(original), changes);
    expect(result.bytes[officer + 9]).toBe(0xb0);
    expect(result.writes).toEqual([{ offset: officer + 9, width: 1, before: 0xad, after: 0xb0 }]);
    expect(result.preview.map(({ key, before, after }) => [key, before, after])).toEqual([
      ["lifecycle.0.finishRecovery", 0, 1],
      ["officer.0.recoveryMonths", 5, 0],
      ["officer.0.recoveryState", 1, 0],
      ["lifecycle.0.turncoatMonths", 2, 3],
    ]);
    expect(
      editSan3Lifecycle(
        new San3Document(original),
        Object.fromEntries(Object.entries(changes).reverse()),
      ).bytes,
    ).toEqual(result.bytes);
    result.bytes[officer + 9] = original[officer + 9] as number;
    expect(result.bytes).toEqual(original);
  });

  it("ends infiltration with prior-faction cleanup while preserving prior service and unknown bits", () => {
    const original = fixture();
    const result = editSan3Lifecycle(new San3Document(original), {
      "lifecycle.0.endInfiltration": 1,
    });
    expect(result.bytes[officer + 11]).toBe(0xe0);
    expect(result.bytes[officer + 19]).toBe(255);
    expect(result.bytes[officer + 20]).toBe(21);
    expect(result.preview).toContainEqual(
      expect.objectContaining({ key: "officer.0.originFaction", before: 1, after: 255 }),
    );
    for (const write of result.writes) result.bytes[write.offset] = write.before;
    expect(result.bytes).toEqual(original);
  });

  it("rejects unknown infiltration state and inconsistent covert affiliation", () => {
    for (const [relative, value] of [
      [11, 0xfb],
      [11, 3],
      [19, 0],
      [19, 255],
    ]) {
      const bytes = fixture();
      bytes[officer + (relative as number)] = value as number;
      expect(() =>
        editSan3Lifecycle(new San3Document(bytes), { "lifecycle.0.endInfiltration": 1 }),
      ).toThrow();
    }
  });

  it("rejects unavailable, dead, rebel, battle and assigned officers without partial writes", () => {
    for (const [relative, value] of [
      [8, 0x10],
      [8, 8],
      [8, 4],
      [9, 0xed],
      [12, 7],
      [26, 2],
      [27, 1],
    ]) {
      const bytes = fixture();
      bytes[officer + (relative as number)] = value as number;
      const document = new San3Document(bytes);
      expect(lifecycleFields(document, 0).every((field) => field.readonly)).toBe(true);
      expect(() => editSan3Lifecycle(document, { "lifecycle.0.finishRecovery": 1 })).toThrow();
      expect(document.copy()).toEqual(bytes);
    }
  });

  it("validates the complete draft and keeps unchanged inputs inert", () => {
    const bytes = fixture();
    const document = new San3Document(bytes);
    for (const changes of [
      { "lifecycle.0.finishRecovery": 1, "lifecycle.0.turncoatMonths": 4 },
      { "lifecycle.0.turncoatMonths": -1 },
      { "lifecycle.0.turncoatMonths": 1.5 },
      { "lifecycle.0.finishRecovery": 2 },
      { "lifecycle.600.finishRecovery": 1 },
      { "lifecycle.00.finishRecovery": 1 },
      { "lifecycle.0.dead": 1 },
    ]) {
      expect(() => editSan3Lifecycle(document, changes)).toThrow();
      expect(document.copy()).toEqual(bytes);
    }
    const result = editSan3Lifecycle(document, {
      "lifecycle.0.turncoatMonths": 2,
      "lifecycle.0.finishRecovery": 0,
    });
    expect(result.bytes).toEqual(bytes);
    expect(result.writes).toEqual([]);
    expect(result.preview).toEqual([]);
  });

  it("previews dependent effects and keeps pending cleanup controls reversible", () => {
    const bytes = fixture();
    const changes = { "lifecycle.0.finishRecovery": 1 };
    const view = san3Adapter.view(bytes, { module: "officers", record: "0", changes });
    expect(view.changes).toEqual(changes);
    expect(view.fields.find(({ key }) => key === "lifecycle.0.finishRecovery")).toMatchObject({
      value: 1,
      readonly: false,
      boolean: true,
    });
    expect(view.preview).toContainEqual(
      expect.objectContaining({ key: "officer.0.recoveryState", before: 1, after: 0 }),
    );
    expect(view.batchKeys?.some((key) => key.startsWith("lifecycle."))).toBe(false);
    expect(san3Adapter.apply(bytes, { changes: view.changes })[officer + 9]).toBe(0xa0);
    expect(() => san3Adapter.apply(bytes, { changes: { "officer.0.recoveryState": 0 } })).toThrow();
  });

  it("canonicalizes no-op intents and permits unrelated scalar changes", () => {
    const bytes = fixture();
    const noops = { "lifecycle.0.turncoatMonths": 2, "lifecycle.0.finishRecovery": 0 };
    expect(san3Adapter.view(bytes, { changes: noops }).changes).toEqual({});
    expect(() => san3Adapter.apply(bytes, { changes: noops })).toThrow("editor.noChanges");
    const changes = {
      "city.0.gold": 321,
      "lifecycle.0.turncoatMonths": 3,
      "move.0.city": 0,
      "ruler.0.officer": 0,
    };
    const view = san3Adapter.view(bytes, { changes });
    expect(view.changes).toEqual({ "city.0.gold": 321, "lifecycle.0.turncoatMonths": 3 });
    const result = san3Adapter.apply(bytes, { changes: view.changes });
    expect(new DataView(result.buffer).getUint16(san3Layout.cities.offset + 14)).toBe(321);
    expect(result[officer + 9]).toBe(0xbd);
  });

  it("retains all three canonical intents through client preview, navigation and publication", () => {
    const bytes = fixture();
    for (const [id, value, relative, expected] of [
      ["finishRecovery", 1, 9, 0xa0],
      ["turncoatMonths", 3, 9, 0xbd],
      ["endInfiltration", 1, 11, 0xe0],
    ] as const) {
      const changes = { [`lifecycle.0.${id}`]: value };
      const initial = san3Adapter.view(bytes, { module: "officers", record: "0", changes });
      const retained = previewedEditorChanges(initial);
      expect(retained).toEqual(changes);
      const navigated = san3Adapter.view(bytes, { module: "cities", changes: retained });
      const publishable = previewedEditorChanges(navigated);
      expect(publishable).toEqual(changes);
      expect(Object.keys(publishable).some((key) => key.startsWith("officer."))).toBe(false);
      const result = san3Adapter.apply(bytes, { changes: publishable });
      expect(result[officer + relative]).toBe(expected);
      expect(result).toEqual(san3Adapter.apply(bytes, { changes }));
    }
  });

  it("rejects mixed structural or same-officer live changes without changing input", () => {
    const bytes = fixture();
    const original = bytes.slice();
    for (const extra of [
      { "officer.0.ambition": 1 },
      { "move.0.city": 1 },
      { "ruler.0.officer": 1 },
    ]) {
      expect(() =>
        san3Adapter.apply(bytes, { changes: { "lifecycle.0.turncoatMonths": 3, ...extra } }),
      ).toThrow();
      expect(bytes).toEqual(original);
    }
    expect(() =>
      san3Adapter.view(bytes, {
        module: "officers",
        record: "0",
        changes: { "lifecycle.0.turncoatMonths": 3 },
        action: { id: "copy-fields", record: "0", targets: ["1"] },
      }),
    ).toThrow();
  });
});
