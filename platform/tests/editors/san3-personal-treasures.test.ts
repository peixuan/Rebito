import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import { expandSan3Batch } from "../../src/editors/san3/batch.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import { editSan3Campaign } from "../../src/editors/san3/operations.ts";
import {
  editSan3PersonalTreasures,
  san3PersonalTreasureFields,
} from "../../src/editors/san3/personal-treasures.ts";
import { governanceOfficer as officer, san3GovernanceFixture } from "./san3-governance-fixture.ts";

describe("SAN3 independent personal treasures", () => {
  it("batches books and flags and preserves explicit duplicates during a global transfer", () => {
    const bytes = san3GovernanceFixture();
    const data = new DataView(bytes.buffer);
    data.setUint16(0x787aa + 4 * 2, 1);
    data.setUint16(officer(1) + 4, 16);
    const document = new San3Document(bytes);
    const expanded = expandSan3Batch(
      document,
      {
        "personalTreasure.1.5": 1,
        "book.1.copies": 7,
      },
      "officer",
      1,
      [2, 599],
    );
    const batch = editSan3Campaign(document, expanded);
    for (const index of [1, 2, 599])
      expect(new San3Document(batch.bytes).read(officer(index) + 4, 2) & 0xe021).toBe(0xe021);
    expect(new DataView(batch.bytes.buffer).getUint16(0x787aa)).toBe(0);
    const changes = { "treasure.4.owner": 2, "personalTreasure.1.4": 1 };
    const transferred = editSan3Campaign(document, changes);
    expect(transferred.operationChanges).toEqual(changes);
    expect(new DataView(transferred.bytes.buffer).getUint16(0x787aa + 8)).toBe(2);
    expect(new San3Document(transferred.bytes).read(officer(1) + 4, 2)).toBe(16);
    expect(new San3Document(transferred.bytes).read(officer(2) + 4, 2)).toBe(16);
    expect(editSan3Campaign(document, transferred.operationChanges).bytes).toEqual(
      transferred.bytes,
    );
    expect(() =>
      editSan3Campaign(document, { ...expanded, "personalTreasure.599.3": 2 }),
    ).toThrow();
    expect(document.copy()).toEqual(bytes);
  });
  it("allows duplicates and preserves global owners, book quantities and every unrelated byte", () => {
    const bytes = Buffer.from(san3GovernanceFixture());
    bytes.writeUInt16BE(0xe001, officer(1) + 4);
    const original = Buffer.from(bytes);
    const document = new San3Document(bytes);
    const changes = {
      "personalTreasure.1.4": 1,
      "personalTreasure.2.4": 1,
      "personalTreasure.1.12": 1,
    };
    const result = editSan3PersonalTreasures(document, changes);
    expect(new San3Document(result.bytes).read(officer(1) + 4, 2)).toBe(0xf011);
    expect(new San3Document(result.bytes).read(officer(2) + 4, 2)).toBe(16);
    const restored = result.bytes.slice();
    for (const { offset } of result.writes)
      restored.set(original.subarray(offset, offset + 2), offset);
    expect(restored).toEqual(new Uint8Array(original));
    expect(bytes).toEqual(original);
    expect(document.copy()).toEqual(new Uint8Array(original));
    expect(editSan3PersonalTreasures(document, previewedEditorChanges(result)).bytes).toEqual(
      result.bytes,
    );
    const after = new San3Document(result.bytes);
    expect(editSan3PersonalTreasures(after, changes)).toMatchObject({
      changes: {},
      writes: [],
      preview: [],
    });
    const cleared = editSan3PersonalTreasures(after, { "personalTreasure.1.4": 0 });
    expect(new San3Document(cleared.bytes).read(officer(1) + 4, 2)).toBe(0xf001);
    expect(san3PersonalTreasureFields(after, 1)).toHaveLength(12);
  });

  it("does not depend on global ownership consistency and validates every requested bit", () => {
    const document = new San3Document(san3GovernanceFixture());
    expect(
      editSan3PersonalTreasures(document, { "personalTreasure.599.11": 1 }).writes,
    ).toHaveLength(1);
    for (const invalid of [
      { "personalTreasure.600.1": 1 },
      { "personalTreasure.01.1": 1 },
      { "personalTreasure.1.0": 1 },
      { "personalTreasure.1.13": 1 },
      { "personalTreasure.1.1": 2 },
      { "personalTreasure.1.1": -1 },
      { "personalTreasure.1.1": 0.5 },
      { "officer.1.treasures": 65535 },
    ])
      expect(() =>
        editSan3PersonalTreasures(document, { "personalTreasure.2.4": 1, ...invalid }),
      ).toThrow();
    expect(document.copy()).toEqual(san3GovernanceFixture());
  });
});
