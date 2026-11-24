import { describe, expect, it } from "vitest";
import { changeEditorField, resolveEditorFields } from "../../client/controls/editor-fields.ts";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import { governanceOfficer, san3GovernanceFixture } from "./san3-governance-fixture.ts";

describe("SAN3 army transition previews", () => {
  it("recruits from zero with live controls and validates the final leadership draft", () => {
    const bytes = san3GovernanceFixture();
    const data = new DataView(bytes.buffer);
    data.setUint16(governanceOfficer(1) + 2, 0);
    const source = new San3Document(bytes);
    bytes.fill(70, source.attributeOffset(1), source.attributeOffset(1) + 6);
    const view = san3Adapter.view(bytes, { module: "officers", record: "1" });
    expect(
      resolveEditorFields(view.fields).find(({ columnId }) => columnId === "training")?.readonly,
    ).toBe(true);
    const changes = changeEditorField(view.fields, {}, "officer.1.soldiers", 18_000);
    expect(
      resolveEditorFields(view.fields, changes).find(({ columnId }) => columnId === "training")
        ?.readonly,
    ).toBe(false);
    Object.assign(changes, {
      "officer.1.land": 80,
      "officer.1.training": 85,
      "officer.1.morale": 90,
    });
    const preview = san3Adapter.view(bytes, { module: "officers", record: "1", changes });
    expect(preview.changes).toEqual(changes);
    const result = new San3Document(san3Adapter.apply(bytes, { changes: preview.changes }));
    expect(result.officer(1)).toMatchObject({ soldiers: 18_000, training: 85, morale: 90 });
    expect(result.attributes(1).land).toBe(80);
    expect(() => san3Adapter.apply(bytes, { changes: { "officer.1.training": 50 } })).toThrow();
  });

  it("shows army-dependent clearing without accepting derived effects as inputs", () => {
    const bytes = san3GovernanceFixture();
    const changes = { "officer.1.soldiers": 0 };
    const preview = san3Adapter.view(bytes, { module: "officers", record: "1", changes });
    expect(preview.changes).toEqual(changes);
    const effects = Object.fromEntries(preview.preview.map(({ key, ...effect }) => [key, effect]));
    expect(effects).toMatchObject({
      "armyEffect.1.training": { before: 67, after: 0 },
      "armyEffect.1.morale": { before: 78, after: 0 },
    });
    const result = new San3Document(san3Adapter.apply(bytes, { changes: preview.changes }));
    expect(result.officer(1)).toMatchObject({ soldiers: 0, training: 0, morale: 0, role: 2 });
    for (const extra of [{ "officer.1.training": 5 }, { "armyEffect.1.morale": 0 }])
      expect(() => san3Adapter.apply(bytes, { changes: { ...changes, ...extra } })).toThrow();
    expect(bytes).toEqual(san3GovernanceFixture());
  });
});
