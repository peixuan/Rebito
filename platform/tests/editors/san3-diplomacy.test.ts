import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import { editSan3Diplomacy, san3DiplomacyFields } from "../../src/editors/san3/diplomacy.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { san3GovernanceFixture } from "./san3-governance-fixture.ts";

const faction = (index: number) => san3Layout.factions.offset + index * 50;

describe("SAN3 diplomacy", () => {
  it("updates reciprocal alliance masks and directed hostility while preserving all other bytes", () => {
    const original = Buffer.from(san3GovernanceFixture());
    original.writeUInt32BE(0xffe00000, faction(0) + 6);
    original.writeUInt32BE(0x80000000, faction(1) + 6);
    original[faction(1) + 15] = 73;
    const document = new San3Document(original);
    const result = editSan3Diplomacy(document, {
      "diplomacy.0.alliance.1": 1,
      "diplomacy.0.hostility.1": 100,
    });
    const after = new San3Document(result.bytes);
    expect(after.read(faction(0) + 6, 4)).toBe(0xffe00002);
    expect(after.read(faction(1) + 6, 4)).toBe(0x80000001);
    expect(after.read(faction(1) + 15, 1)).toBe(73);
    const restored = result.bytes.slice();
    for (const { offset, width } of result.writes)
      restored.set(original.subarray(offset, offset + width), offset);
    expect(restored).toEqual(new Uint8Array(original));
    expect(document.copy()).toEqual(new Uint8Array(original));
    expect(editSan3Diplomacy(document, previewedEditorChanges(result)).bytes).toEqual(result.bytes);
    expect(san3DiplomacyFields(after, 0).map(({ value }) => value)).toEqual([1, 100]);
    expect(san3DiplomacyFields(after, 0).map(({ columnId }) => columnId)).toEqual([
      "alliance.1",
      "hostility.1",
    ]);
    expect(san3DiplomacyFields(after, 2)).toEqual([]);
    expect(editSan3Diplomacy(after, result.changes)).toMatchObject({
      changes: {},
      preview: [],
      writes: [],
    });
  });

  it("repairs an asymmetric alliance with a canonical changed direction and supports cancellation", () => {
    const bytes = san3GovernanceFixture();
    new DataView(bytes.buffer).setUint32(faction(0) + 6, 2);
    const document = new San3Document(bytes);
    const repaired = editSan3Diplomacy(document, { "diplomacy.0.alliance.1": 1 });
    expect(repaired.changes).toEqual({ "diplomacy.1.alliance.0": 1 });
    expect(editSan3Diplomacy(document, previewedEditorChanges(repaired)).bytes).toEqual(
      repaired.bytes,
    );
    const canceled = editSan3Diplomacy(new San3Document(repaired.bytes), {
      "diplomacy.1.alliance.0": 0,
    });
    expect(new San3Document(canceled.bytes).read(faction(0) + 6, 4)).toBe(0);
    expect(new San3Document(canceled.bytes).read(faction(1) + 6, 4)).toBe(0);
  });

  it("rejects contradictory pairs, inactive/self targets, malformed keys and out-of-range values atomically", () => {
    const document = new San3Document(san3GovernanceFixture());
    for (const invalid of [
      { "diplomacy.1.alliance.0": 0 },
      { "diplomacy.0.alliance.0": 1 },
      { "diplomacy.0.alliance.2": 1 },
      { "diplomacy.21.hostility.0": 1 },
      { "diplomacy.00.hostility.1": 0 },
      { "diplomacy.0.hostility.1": 101 },
      { "diplomacy.0.hostility.1": -1 },
      { "diplomacy.0.hostility.1": 0.5 },
      { "diplomacy.0.alliance.1": 2 },
      { "faction.0.hostility.1": 0 },
    ])
      expect(() =>
        editSan3Diplomacy(document, { "diplomacy.0.alliance.1": 1, ...invalid }),
      ).toThrow();
    expect(document.copy()).toEqual(san3GovernanceFixture());
    const changes = { "diplomacy.0.hostility.1": 54, "diplomacy.1.hostility.0": 12 };
    expect(editSan3Diplomacy(document, changes).bytes).toEqual(
      editSan3Diplomacy(document, Object.fromEntries(Object.entries(changes).reverse())).bytes,
    );
  });
});
