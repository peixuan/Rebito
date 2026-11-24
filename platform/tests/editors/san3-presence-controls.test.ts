import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { editSan3Presence, san3PresenceFields } from "../../src/editors/san3/presence-controls.ts";
import { san3TreasureLayout } from "../../src/editors/san3/treasures.ts";
import { governanceOfficer as officer, san3GovernanceFixture } from "./san3-governance-fixture.ts";

function fixture() {
  const bytes = san3GovernanceFixture();
  const data = new DataView(bytes.buffer);
  for (let index = 1; index < 13; index++)
    data.setUint16(san3TreasureLayout.owners + index * 2, 65535);
  for (const index of [2, 11]) data.setUint16(san3Layout.historical.offset + index * 30, 1);
  return bytes;
}

describe("SAN3 service and discovery controls", () => {
  it("round-trips resignation and recruitment without submitting dependent effects", () => {
    const original = fixture();
    const document = new San3Document(Buffer.from(original));
    const first = editSan3Presence(document, { "presence.2.role": 5 });
    expect(previewedEditorChanges(first)).toEqual({ "presence.2.role": 5 });
    expect(first.preview.map((row) => row.key)).toEqual([
      "presence.2.role",
      "presenceEffect.2.soldiers",
      "presenceEffect.2.loyalty",
      "presenceEffect.2.training",
      "presenceEffect.2.morale",
      "presenceEffect.2.faction",
      "presenceEffect.2.advisor",
    ]);
    expect(editSan3Presence(document, previewedEditorChanges(first)).bytes).toEqual(first.bytes);
    const resigned = new San3Document(first.bytes);
    const recruited = editSan3Presence(resigned, { "presence.2.role": 4 });
    expect(editSan3Presence(resigned, previewedEditorChanges(recruited)).bytes).toEqual(
      recruited.bytes,
    );
    expect(new San3Document(recruited.bytes).officer(2)).toMatchObject({ role: 4, faction: 0 });
    expect(
      recruited.preview
        .filter((row) => row.key.startsWith("presenceEffect."))
        .map((row) => [row.key, row.before, row.after]),
    ).toEqual([
      ["presenceEffect.2.loyalty", 0, 100],
      ["presenceEffect.2.serviceYears", 0, 1],
      ["presenceEffect.2.faction", { messageId: "san3.none" }, expect.any(Object)],
    ]);
    first.bytes.fill(0);
    expect(document.copy()).toEqual(original);
  });

  it("retains an explicit appearance city after consecutive previews", () => {
    const bytes = fixture();
    const document = new San3Document(bytes);
    const first = editSan3Presence(document, { "presence.11.role": 4, "presence.11.city": 1 });
    const canonical = previewedEditorChanges(first);
    expect(canonical).toEqual({ "presence.11.role": 4, "presence.11.city": 1 });
    const second = editSan3Presence(document, canonical);
    expect(previewedEditorChanges(second)).toEqual(canonical);
    expect(second.bytes).toEqual(first.bytes);
    expect(san3PresenceFields(document, 11, canonical).map((field) => field.value)).toEqual([4, 1]);
    expect(
      san3PresenceFields(document, 11, { "presence.11.city": 4 })[0]?.choices?.map(
        (choice) => choice.value,
      ),
    ).toEqual([7, 5, 6]);
    expect(editSan3Presence(document, { "presence.11.city": 1 }).changes).toEqual({});
    expect(first.preview.map((row) => row.key)).toContain("presenceEffect.11.serviceYears");
  });

  it("previews retained service metadata and action status being cleared on resignation", () => {
    const bytes = fixture();
    bytes[officer(2) + 8] = 0x81;
    bytes[officer(2) + 18] = 9;
    bytes[officer(2) + 19] = 1;
    bytes[officer(2) + 20] = 7;
    const result = editSan3Presence(new San3Document(bytes), { "presence.2.role": 6 });
    for (const [id, before, after] of [
      ["serviceYears", 9, 0],
      ["originServiceYears", 7, 0],
      ["actionComplete", 1, 0],
    ])
      expect(result.preview.find((row) => row.key === `presenceEffect.2.${id}`)).toMatchObject({
        before,
        after,
      });
    expect(
      result.preview.find((row) => row.key === "presenceEffect.2.originFaction")?.after,
    ).toEqual({ messageId: "san3.none" });
  });

  it("shows unsupported states read-only and rejects malformed or implicit moves", () => {
    const bytes = fixture();
    bytes[officer(599) + 12] = 255;
    const document = new San3Document(bytes);
    expect(san3PresenceFields(document, 0).every((field) => field.readonly)).toBe(true);
    expect(san3PresenceFields(document, 599)[0]).toMatchObject({
      readonly: true,
      choices: [
        { value: 255, label: { messageId: "editor.unknownValue", parameters: { value: 255 } } },
      ],
    });
    for (const draft of [
      { "presence.0.role": 5 },
      { "presence.599.role": 5 },
      { "presence.600.role": 5 },
      { "presence.2.role": 5, "presence.2.city": 4 },
      { "presence.2.role": 7 },
      { "presence.2.role": 2.5 },
      { "presence.2.city": 46 },
      { "presenceEffect.2.soldiers": 0 },
    ])
      expect(() => editSan3Presence(document, draft)).toThrow();
  });
});
