import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import { inspectSan3TurnOrder } from "../../src/editors/san3/turn-order.ts";
import { san3TurnOrderFields } from "../../src/editors/san3/turn-order-view.ts";
import { san3TurnOrderFixture } from "./san3-turn-order-fixture.ts";

describe("SAN3 combined faction settings", () => {
  it("previews control, symbols, diplomacy and future positions as one replayable draft", () => {
    const bytes = san3TurnOrderFixture();
    const changes = {
      "factionControl.4.human": 1,
      "factionIcon.4.symbol": 24,
      "diplomacy.4.alliance.2": 1,
      "diplomacy.4.hostility.2": 37,
      "turnOrder.4.position": 3,
    };
    const view = san3Adapter.view(bytes, { module: "factions", record: "4", changes });
    expect(view.fields.find(({ columnId }) => columnId === "turnPosition")).toMatchObject({
      value: 3,
      readonly: false,
    });
    expect(view.fields.filter(({ columnId }) => columnId === "alliance.2")).toHaveLength(1);
    expect(view.fields.find(({ columnId }) => columnId === "alliance.2")?.readonly).not.toBe(true);
    expect(view.batchKeys).toEqual(["factionControl.4.human"]);
    const canonical = previewedEditorChanges(view);
    const result = san3Adapter.apply(bytes, { changes: canonical });
    const document = new San3Document(result);
    expect(inspectSan3TurnOrder(document)).toEqual({ factions: [1, 0, 4, 2, 3], cursor: 1 });
    expect(document.read(0x7dc0e, 1)).toBe(1);
    expect(document.read(0x78790, 1)).toBe(24);
    expect(document.read(document.offset("factions", 2) + 6, 4)).toBe(16);
    expect(document.read(document.offset("factions", 4) + 17, 1)).toBe(37);
    const switched = san3Adapter.view(bytes, {
      module: "factions",
      record: "2",
      changes: canonical,
    });
    expect(switched.changes).toEqual(canonical);
    expect(san3Adapter.apply(bytes, { changes: switched.changes })).toEqual(result);
    expect(bytes).toEqual(san3TurnOrderFixture());
  });

  it("keeps current and completed slots read-only and rejects mixed failures atomically", () => {
    const bytes = san3TurnOrderFixture();
    const document = new San3Document(bytes);
    for (const index of [0, 1, 20])
      expect(san3TurnOrderFields(document, index)[0]?.readonly).toBe(true);
    expect(san3TurnOrderFields(document, 2)[0]?.choices?.map(({ value }) => value)).toEqual([
      3, 4, 5,
    ]);
    for (const extra of [
      { "turnOrder.0.position": 5 },
      { "factionIcon.2.symbol": 25 },
      { "diplomacy.4.hostility.2": 101 },
      { "city.0.gold": 2 },
    ])
      expect(() =>
        san3Adapter.apply(bytes, { changes: { "factionControl.4.human": 1, ...extra } }),
      ).toThrow();
    expect(bytes).toEqual(san3TurnOrderFixture());
    bytes[0x7dc1f] = 255;
    expect(san3TurnOrderFields(new San3Document(bytes), 2)).toEqual([]);
    expect(
      san3Adapter
        .view(bytes, { module: "factions", record: "2" })
        .fields.find(({ columnId }) => columnId === "factionControl")?.readonly,
    ).toBe(false);
  });
});
