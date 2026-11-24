import { describe, expect, it } from "vitest";
import {
  previewedEditorChanges,
  resolveEditorFields,
} from "../../client/controls/editor-fields.ts";
import { editSan3Creation, san3CreationFields } from "../../src/editors/san3/creation-view.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import { governanceCity, governanceOfficer } from "./san3-governance-fixture.ts";
import { san3TurnOrderFixture } from "./san3-turn-order-fixture.ts";

function fixture() {
  return Buffer.from(san3TurnOrderFixture());
}

describe("SAN3 founding controls", () => {
  it("enables control after choosing a resident and preserves computer control in canonical previews", () => {
    const bytes = fixture();
    const document = new San3Document(bytes);
    const fields = san3CreationFields(document, 5);
    expect(resolveEditorFields(fields)[1]?.readonly).toBe(true);
    const draft = { "founding.5.founder": 4, "founding.5.human": 0 };
    expect(resolveEditorFields(fields, draft)[1]).toMatchObject({ readonly: false, value: 0 });
    const first = editSan3Creation(document, draft);
    expect(previewedEditorChanges(first)).toEqual(draft);
    expect(editSan3Creation(document, previewedEditorChanges(first))).toEqual(first);
    expect(san3CreationFields(document, 5, first.changes).map((field) => field.value)).toEqual([
      4, 0,
    ]);
    expect(san3CreationFields(new San3Document(first.bytes), 5)).toEqual([]);
    const effects = Object.fromEntries(first.preview.map((row) => [row.key, row]));
    expect(effects["foundingEffect.3.faction"]?.after).toEqual({
      messageId: "san3.factionOf",
      parameters: { ruler: { messageId: "san3.officerRecord", parameters: { index: 4 } } },
    });
    expect(effects["foundingEffect.5.count"]).toMatchObject({ before: 5, after: 6 });
    expect(effects["foundingEffect.5.turn"]?.after).toEqual({
      messageId: "san3.foundingNextMonth",
    });
    expect(effects["foundingEffect.5.hostility0.5"]?.after).toBe(100);
    expect(effects["foundingEffect.5.hostility5.0"]?.after).toBe(30);
    expect(document.copy()).toEqual(new Uint8Array(bytes));
  });

  it("distinguishes retired neutral-founder troops and includes equipment and allegiance effects", () => {
    const bytes = fixture();
    bytes.writeUInt16BE(900, governanceOfficer(9) + 2);
    bytes[governanceOfficer(9) + 10] = 3;
    const result = editSan3Creation(new San3Document(bytes), { "founding.5.founder": 10 });
    expect(result.changes).toEqual({ "founding.5.founder": 10, "founding.5.human": 1 });
    const effects = new Map(result.preview.map((row) => [row.key, row]));
    expect(effects.get("foundingEffect.9.storedRetiredSoldiers")).toMatchObject({
      before: 900,
      after: 0,
    });
    expect(effects.get("foundingEffect.9.weapon")).toMatchObject({
      before: { messageId: "san3.heavyCrossbows" },
      after: { messageId: "san3.infantry" },
    });
    expect(editSan3Creation(new San3Document(bytes), previewedEditorChanges(result))).toEqual(
      result,
    );
    expect(
      editSan3Creation(new San3Document(bytes), { "founding.5.founder": 0, "founding.5.human": 0 }),
    ).toEqual({ bytes: new Uint8Array(bytes), changes: {}, preview: [] });
  });

  it("keeps invalid graphs readable and rejects forged, conflicting or malformed intent batches", () => {
    const bytes = fixture();
    const document = new San3Document(bytes);
    for (const draft of [
      { "founding.5.founder": 4, "founding.6.founder": 5 },
      { "founding.5.founder": 4, "founding.5.human": 2 },
      { "founding.21.founder": 4 },
      { "founding.05.founder": 4 },
      { "founding.5.founder": 601 },
      { "founding.5.founder": 1.5 },
      { "foundingEffect.5.capital": 1 },
    ])
      expect(() => editSan3Creation(document, draft)).toThrow();
    expect(document.copy()).toEqual(new Uint8Array(bytes));
    bytes.writeUInt32BE(governanceCity(0), governanceCity(0));
    const broken = san3CreationFields(new San3Document(bytes), 5);
    expect(broken[0]).toMatchObject({
      readonly: true,
      choices: [{ value: 0, label: { messageId: "san3.none" } }],
    });
  });
});
