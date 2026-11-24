import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { san3OperationFields } from "../../src/editors/san3/operation-fields.ts";
import {
  governanceCity as city,
  governanceOfficer as officer,
  san3GovernanceFixture,
} from "./san3-governance-fixture.ts";

describe("SAN3 relocation controls and preview", () => {
  it("offers same-faction cities to a ruler and preserves a draft across records", () => {
    const bytes = san3GovernanceFixture();
    const document = new San3Document(bytes);
    const field = san3OperationFields(document, "officers", 0)[0];
    expect(field).toMatchObject({ readonly: false, value: 0 });
    expect(field?.choices?.map(({ value }) => value)).toEqual([0, 1, 2]);
    const changes = { "move.0.city": 1 };
    const view = san3Adapter.view(bytes, { module: "officers", record: "0", changes });
    expect(previewedEditorChanges(view)).toEqual(changes);
    const second = san3Adapter.view(bytes, {
      module: "cities",
      record: "1",
      changes: view.changes,
    });
    expect(previewedEditorChanges(second)).toEqual(changes);
    expect(view.preview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "move.0.city" }),
        expect.objectContaining({ key: "moveFaction.0.capital" }),
        expect.objectContaining({ key: "moveCity.0.governor" }),
        expect.objectContaining({ key: "moveCity.1.governor" }),
      ]),
    );
    expect(view.preview.some(({ key }) => /\.(soldiers|training|morale)$/.test(key))).toBe(false);
    const applied = new San3Document(san3Adapter.apply(bytes, { changes: second.changes }));
    expect(applied.officer(0)).toMatchObject({ city: 1, soldiers: 3000 });
    expect(applied.read(san3Layout.factions.offset + 2, 4)).toBe(city(1));
  });

  it("shows task cancellation, resource refunds and capped losses without exposing pointers", () => {
    const bytes = san3GovernanceFixture();
    bytes[officer(1) + 9] = 0xc0;
    bytes[officer(1) + 10] = 0x75;
    bytes[officer(1) + 26] = 2;
    bytes[officer(1) + 27] = 3;
    bytes[city(0) + 24] = 4;
    new DataView(bytes.buffer).setUint16(city(0) + 40, 9990);
    const changes = { "move.1.city": 3 };
    const view = san3Adapter.view(bytes, { module: "officers", record: "1", changes });
    expect(previewedEditorChanges(view)).toEqual(changes);
    const effects = new Map(view.preview.map((row) => [row.key, row]));
    expect(effects.has("move.1.task")).toBe(true);
    expect(effects.get("moveCity.0.warhorses")).toMatchObject({ before: 9990, after: 9999 });
    expect(effects.get("moveLoss.0.warhorses")).toMatchObject({ before: 0, after: 21 });
    expect(effects.get("moveLoss.0.heavyWarships")).toMatchObject({ before: 0, after: 1 });
    expect(view.changes).toEqual(changes);
  });

  it("identifies the actual current-city-empty constraint", () => {
    const bytes = san3GovernanceFixture();
    new DataView(bytes.buffer).setUint32(0x7dc2a, city(2));
    const field = san3OperationFields(new San3Document(bytes), "officers", 8)[0];
    expect(field).toMatchObject({ readonly: true });
    expect(JSON.stringify(field?.help)).toContain("san3.relocationCurrentCityEmpty");
  });
});
