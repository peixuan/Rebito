import { describe, expect, it } from "vitest";
import { previewedEditorChanges } from "../../client/controls/editor-fields.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { removeSan3Officer } from "../../src/editors/san3/governance-life.ts";
import { editSan3Life, san3LifeFields } from "../../src/editors/san3/life-controls.ts";
import { san3TreasureLayout } from "../../src/editors/san3/treasures.ts";
import { governanceOfficer as officer, san3GovernanceFixture } from "./san3-governance-fixture.ts";

function fixture() {
  const bytes = san3GovernanceFixture();
  const data = new DataView(bytes.buffer);
  for (let index = 1; index < 13; index++)
    data.setUint16(san3TreasureLayout.owners + index * 2, 65535);
  data.setUint16(san3Layout.historical.offset + 2 * 30, 1);
  return bytes;
}

describe("SAN3 life operation controls", () => {
  it("retains only death intent while previewing army, advisor and item inheritance", () => {
    const original = fixture();
    const data = new DataView(original.buffer);
    data.setUint16(san3TreasureLayout.owners + 2, 2);
    data.setUint16(officer(2) + 4, 2);
    const document = new San3Document(Buffer.from(original));
    const first = editSan3Life(document, { "life.2.dead": 1 });
    const canonical = previewedEditorChanges(first);
    expect(canonical).toEqual({ "life.2.dead": 1 });
    expect(first.preview.map((row) => row.key)).toEqual([
      "life.2.dead",
      "lifeEffect.2.roster",
      "lifeEffect.2.soldiers",
      "lifeEffect.2.belongings",
      "lifeEffect.2.treasure.1",
      "lifeEffect.2.advisor",
    ]);
    expect(editSan3Life(document, canonical).bytes).toEqual(first.bytes);
    expect(() => editSan3Life(document, { "lifeEffect.2.soldiers": 0 })).toThrow();
    first.bytes.fill(0);
    expect(document.copy()).toEqual(original);
  });

  it("keeps a revival destination through repeated preview and apply", () => {
    const document = new San3Document(removeSan3Officer(new San3Document(fixture()), 2).bytes);
    const first = editSan3Life(document, { "life.2.city": 4, "life.2.dead": 0 });
    const canonical = previewedEditorChanges(first);
    expect(canonical).toEqual({ "life.2.dead": 0, "life.2.city": 4 });
    const second = editSan3Life(document, canonical);
    expect(previewedEditorChanges(second)).toEqual(canonical);
    expect(second.bytes).toEqual(first.bytes);
    expect(new San3Document(second.bytes).officer(2)).toMatchObject({ city: 4, role: 5 });
    expect(san3LifeFields(document, 2, canonical).map((field) => field.value)).toEqual([0, 4]);
    expect(editSan3Life(document, { "life.2.city": 4 }).changes).toEqual({});
    expect(first.preview.find((row) => row.key === "lifeEffect.2.faction")?.after).toEqual({
      messageId: "san3.none",
    });
    for (const [id, before] of [
      ["storedRetiredSoldiers", 3000],
      ["loyalty", 75],
      ["training", 67],
      ["morale", 78],
    ])
      expect(first.preview.find((row) => row.key === `lifeEffect.2.${id}`)).toMatchObject({
        before,
        after: 0,
      });
  });

  it("previews obsolete recovery, covert, equipment and task metadata cleared by revival", () => {
    const bytes = removeSan3Officer(new San3Document(fixture()), 2).bytes;
    bytes[officer(2) + 8] = 0x9d;
    bytes[officer(2) + 9] = 0x7f;
    bytes[officer(2) + 10] = 0x79;
    bytes[officer(2) + 11] = 0xff;
    bytes[officer(2) + 26] = 7;
    bytes[officer(2) + 27] = 0x24;
    bytes[officer(2) + 28] = 3;
    bytes[officer(2) + 29] = 89;
    const result = editSan3Life(new San3Document(bytes), { "life.2.dead": 0, "life.2.city": 4 });
    for (const [id, before] of [
      ["recoveryMonths", 7],
      ["recoveryState", 1],
      ["turncoatMonths", 3],
      ["infiltrationMonths", 7],
      ["infiltration", 1],
      ["inBattle", 1],
      ["rebellion", 1],
      ["actionComplete", 1],
      ["task.totalMonths", 4],
      ["task.elapsedMonths", 2],
      ["task.effect", 89],
    ])
      expect(result.preview.find((row) => row.key === `lifeEffect.2.${id}`)).toMatchObject({
        before,
        after: 0,
      });
    for (const id of ["weapon", "ship", "task", "task.targetCity"])
      expect(result.preview.some((row) => row.key === `lifeEffect.2.${id}`)).toBe(true);
    expect(result.preview.find((row) => row.key === "lifeEffect.2.weapon")).toMatchObject({
      before: { messageId: "san3.warhorses" },
      after: { messageId: "san3.infantry" },
    });
    expect(result.preview.find((row) => row.key === "lifeEffect.2.ship")).toMatchObject({
      before: { messageId: "san3.mediumWarships" },
      after: { messageId: "san3.noShip" },
    });
    expect(previewedEditorChanges(result)).toEqual({ "life.2.dead": 0, "life.2.city": 4 });
  });

  it("keeps leaders and invalid definitions readable but rejects their transitions", () => {
    const bytes = fixture();
    bytes[officer(599) + 8] = 16;
    new DataView(bytes.buffer).setUint16(san3Layout.custom.offset + 67 * 28, 65535);
    const document = new San3Document(bytes);
    expect(san3LifeFields(document, 0).every((field) => field.readonly)).toBe(true);
    expect(san3LifeFields(document, 599).every((field) => field.readonly)).toBe(true);
    for (const draft of [
      { "life.0.dead": 1 },
      { "life.599.dead": 0 },
      { "life.600.dead": 1 },
      { "life.2.dead": 2 },
      { "life.2.city": 46 },
      { "life.2.city": Number.NaN },
      { "life.02.dead": 1 },
    ])
      expect(() => editSan3Life(document, draft)).toThrow();
  });
});
