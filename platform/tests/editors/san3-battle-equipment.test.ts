import { describe, expect, it } from "vitest";
import { editSan3Battle, San3BattleDocument } from "../../src/editors/san3/battle.ts";
import { san3BattleAdapter } from "../../src/editors/san3/battle-adapter.ts";
import { san3Layout } from "../../src/editors/san3/document.ts";
import { san3BattleFixture } from "./san3-battle-fixture.ts";

const city = san3Layout.cities.offset;
const officer = san3Layout.officers.offset;

function fixture(naval = false) {
  const bytes = san3BattleFixture();
  const data = new DataView(bytes.buffer);
  data.setUint16(0x52056, naval ? 1 : 0);
  bytes[officer + 10] = naval ? 0x74 : 0x70;
  bytes[city + 21] = 0x80;
  for (const relative of [36, 38, 40]) data.setUint16(city + relative, 100);
  for (const relative of [43, 44, 45]) bytes[city + relative] = 10;
  return bytes;
}

describe("SAN3 combat army editing", () => {
  it("previews stock effects while submitting only canonical combat intents", () => {
    const bytes = fixture();
    const draft = {
      changes: {
        "battle.0.weapon": 1,
        "battle.0.soldiers": 2100,
        "battle.0.training": 100,
        "battle.0.morale": 120,
      },
    };
    const view = san3BattleAdapter.view(bytes, draft);
    expect(view.changes).toEqual(draft.changes);
    const effects = Object.fromEntries(view.preview.map(({ key, ...effect }) => [key, effect]));
    expect(effects["battle-stock.0.warhorses"]).toMatchObject({ before: 100, after: 79 });
    const result = san3BattleAdapter.apply(bytes, { changes: view.changes });
    expect(new San3BattleDocument(result).officer(0)).toMatchObject({
      soldiers: 2100,
      weapon: 1,
      training: 100,
      morale: 120,
      mobility: 5,
    });
    const expected = bytes.slice();
    const data = new DataView(expected.buffer);
    data.setUint16(city + 40, 79);
    data.setUint16(officer + 2, 2100);
    expected[officer + 10] = 0x71;
    expected[officer + 21] = 100;
    expected[officer + 22] = 120;
    expect(result).toEqual(expected);
    expect(() =>
      san3BattleAdapter.apply(bytes, {
        changes: { ...view.changes, "battle-stock.0.warhorses": 79 },
      }),
    ).toThrow();
  });

  it("requires a vessel in sea combat and includes both sides of a port exchange", () => {
    const bytes = fixture(true);
    const draft = { changes: { "battle.0.ship": 2 } };
    const view = san3BattleAdapter.view(bytes, draft);
    const effects = Object.fromEntries(view.preview.map(({ key, ...effect }) => [key, effect]));
    expect(effects).toMatchObject({
      "battle-stock.0.heavyWarships": { before: 10, after: 11 },
      "battle-stock.0.mediumWarships": { before: 10, after: 9 },
    });
    expect(
      view.fields.find(({ columnId }) => columnId === "ship")?.choices?.map(({ value }) => value),
    ).toEqual([1, 2, 3]);
    expect(() => editSan3Battle(new San3BattleDocument(bytes), { "battle.0.ship": 0 })).toThrow();
    const nonPort = bytes.slice();
    nonPort[city + 21] = 0;
    expect(() => editSan3Battle(new San3BattleDocument(nonPort), draft.changes)).toThrow();
  });

  it("rejects mixed invalid edits without writing and preserves final-draft capacity", () => {
    const bytes = fixture();
    const document = new San3BattleDocument(bytes);
    for (const changes of [
      { "battle.0.soldiers": 0 },
      { "battle.0.soldiers": 18_201 },
      { "battle.0.training": 101 },
      { "battle.0.morale": 121 },
      { "battle.0.weapon": 4 },
      { "battle.0.ship": 4 },
      { "battle.0.weapon": 1, "battle.0.soldiers": 10_100 },
    ]) {
      expect(() => editSan3Battle(document, { "battle.0.mobility": 90, ...changes })).toThrow();
      expect(document.copy()).toEqual(bytes);
    }
  });
});
