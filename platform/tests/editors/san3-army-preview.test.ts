import { describe, expect, it } from "vitest";
import { changeEditorField, resolveEditorFields } from "../../client/controls/editor-fields.ts";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { governanceOfficer, san3GovernanceFixture } from "./san3-governance-fixture.ts";

describe("SAN3 army transition previews", () => {
  it("recruits from zero with live controls and validates the final leadership draft", () => {
    const bytes = san3GovernanceFixture();
    const data = new DataView(bytes.buffer);
    bytes.copyWithin(governanceOfficer(532), governanceOfficer(1), governanceOfficer(1) + 30);
    data.setUint16(governanceOfficer(1), 532);
    data.setUint16(governanceOfficer(532) + 2, 0);
    data.setUint16(san3Layout.custom.offset, 231);
    const source = new San3Document(bytes);
    bytes.fill(70, source.attributeOffset(532), source.attributeOffset(532) + 6);
    const view = san3Adapter.view(bytes, { module: "officers", record: "532" });
    expect(
      resolveEditorFields(view.fields).find(({ columnId }) => columnId === "training")?.readonly,
    ).toBe(true);
    const changes = changeEditorField(view.fields, {}, "officer.532.soldiers", 18_000);
    expect(
      resolveEditorFields(view.fields, changes).find(({ columnId }) => columnId === "training")
        ?.readonly,
    ).toBe(false);
    Object.assign(changes, {
      "officer.532.land": 80,
      "officer.532.training": 85,
      "officer.532.morale": 90,
    });
    const preview = san3Adapter.view(bytes, { module: "officers", record: "532", changes });
    expect(preview.changes).toEqual(changes);
    const result = new San3Document(san3Adapter.apply(bytes, { changes: preview.changes }));
    expect(result.officer(532)).toMatchObject({ soldiers: 18_000, training: 85, morale: 90 });
    expect(result.attributes(532).land).toBe(80);
    expect(() => san3Adapter.apply(bytes, { changes: { "officer.532.training": 50 } })).toThrow();
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
