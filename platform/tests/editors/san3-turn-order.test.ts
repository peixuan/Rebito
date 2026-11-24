import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { editSan3TurnOrder, inspectSan3TurnOrder } from "../../src/editors/san3/turn-order.ts";
import { san3TurnOrderFixture } from "./san3-turn-order-fixture.ts";

describe("SAN3 remaining monthly turn order", () => {
  it("reorders only the unconsumed suffix and preserves relative displaced order", () => {
    const bytes = san3TurnOrderFixture();
    const document = new San3Document(Buffer.from(bytes));
    const changes = { "turnOrder.4.position": 3, "turnOrder.2.position": 5 };
    const result = editSan3TurnOrder(document, changes);
    expect(inspectSan3TurnOrder(new San3Document(result.bytes))).toEqual({
      factions: [1, 0, 4, 3, 2],
      cursor: 1,
    });
    expect(result.changes).toEqual(changes);
    expect(previewedEditorChanges(result)).toEqual(changes);
    expect(editSan3TurnOrder(document, previewedEditorChanges(result))).toEqual(result);
    expect(
      editSan3TurnOrder(document, Object.fromEntries(Object.entries(changes).reverse())),
    ).toEqual(result);
    expect(result.writes.map(({ offset }) => offset)).toEqual([0x7dbba, 0x7dbc2]);
    const expected = bytes.slice();
    const data = new DataView(expected.buffer);
    data.setUint32(0x7dbba, document.offset("factions", 4));
    data.setUint32(0x7dbc2, document.offset("factions", 2));
    expect(result.bytes).toEqual(expected);
    result.bytes.fill(0);
    expect(document.copy()).toEqual(bytes);
  });

  it("replays the complete permutation and retains explicit unchanged positions", () => {
    const document = new San3Document(san3TurnOrderFixture());
    const result = editSan3TurnOrder(document, { "turnOrder.4.position": 3 });
    expect(result.preview.map(({ key }) => key)).toEqual([
      "turnOrder.4.position",
      "turnOrder.2.position",
      "turnOrder.3.position",
    ]);
    expect(editSan3TurnOrder(document, previewedEditorChanges(result)).bytes).toEqual(result.bytes);
    const fixed = editSan3TurnOrder(document, {
      "turnOrder.3.position": 4,
      "turnOrder.4.position": 3,
    });
    expect(inspectSan3TurnOrder(new San3Document(fixed.bytes)).factions).toEqual([1, 0, 4, 3, 2]);
    expect(editSan3TurnOrder(document, previewedEditorChanges(fixed)).bytes).toEqual(fixed.bytes);
    const repeated = editSan3TurnOrder(new San3Document(result.bytes), result.changes);
    expect(repeated).toMatchObject({ changes: {}, preview: [], writes: [] });
    expect(repeated.bytes).toEqual(result.bytes);
    expect(repeated.bytes).not.toBe(result.bytes);
  });

  it("rejects cursor changes, repeated destinations and invalid targets without partial writes", () => {
    const bytes = san3TurnOrderFixture();
    const document = new San3Document(bytes);
    for (const changes of [
      { "turnOrder.0.position": 3 },
      { "turnOrder.1.position": 4 },
      { "turnOrder.4.position": 2 },
      { "turnOrder.4.position": 6 },
      { "turnOrder.4.position": 3.5 },
      { "turnOrder.4.position": Number.NaN },
      { "turnOrder.2.position": 5, "turnOrder.3.position": 5 },
      { "turnOrder.2.position": 3, "turnOrder.4.position": 3 },
      { "turnOrder.21.position": 3 },
      { "turnOrder.04.position": 3 },
      { "turnOrderEffect.4.position": 3 },
    ]) {
      expect(() => editSan3TurnOrder(document, changes)).toThrow();
      expect(document.copy()).toEqual(bytes);
    }
  });

  it("rejects malformed queues and detects cursor or current-faction mismatch", () => {
    const bytes = san3TurnOrderFixture();
    for (const mutate of [
      (data: DataView) => data.setUint32(0x7dbb2, san3Layout.factions.offset + 1),
      (data: DataView) => data.setUint32(0x7dbb2, san3Layout.factions.offset),
      (data: DataView) => data.setUint32(0x7dbb2, 0),
      (data: DataView) => data.setUint8(0x7dc1f, 5),
      (data: DataView) => data.setUint32(0x7dc22, san3Layout.factions.offset + 50),
    ]) {
      const corrupted = bytes.slice();
      mutate(new DataView(corrupted.buffer));
      expect(() => inspectSan3TurnOrder(new San3Document(corrupted))).toThrow();
    }
  });

  it("keeps eliminated queue entries fixed and never emits an unreplayable inactive intent", () => {
    const bytes = san3TurnOrderFixture();
    new DataView(bytes.buffer).setUint16(san3Layout.factions.offset + 3 * 50, 65535);
    bytes[san3Layout.cities.offset + 6 * san3Layout.cities.stride + 20] = 255;
    const document = new San3Document(bytes);
    const result = editSan3TurnOrder(document, { "turnOrder.4.position": 3 });
    expect(inspectSan3TurnOrder(new San3Document(result.bytes)).factions).toEqual([1, 0, 4, 3, 2]);
    expect(result.changes).toEqual({ "turnOrder.4.position": 3, "turnOrder.2.position": 5 });
    expect(editSan3TurnOrder(document, result.changes).bytes).toEqual(result.bytes);
    expect(() => editSan3TurnOrder(document, { "turnOrder.4.position": 4 })).toThrow();
  });
});
