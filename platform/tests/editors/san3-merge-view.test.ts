import { describe, expect, it } from "vitest";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { san3GovernanceFixture } from "./san3-governance-fixture.ts";

function fixture() {
  const bytes = san3GovernanceFixture();
  bytes[0x7878b] = 2;
  const data = new DataView(bytes.buffer);
  data.setUint32(0x7dc22, san3Layout.factions.offset);
  data.setUint32(0x7dc2a, san3Layout.cities.offset);
  for (let faction = 0; faction < 21; faction++)
    for (const relative of [14, 36, 37, 42])
      bytes[san3Layout.factions.offset + faction * 50 + relative] = 255;
  data.setUint32(san3Layout.factions.offset + 6, 2);
  bytes[san3Layout.factions.offset + 36] = 1;
  bytes[san3Layout.factions.offset + 14] = 1;
  const covert = san3Layout.officers.offset + 2 * 30;
  bytes[covert + 11] = 0xe9;
  bytes[covert + 19] = 1;
  return bytes;
}

describe("SAN3 faction absorption previews", () => {
  it("names removed contracts, covert cleanup and allegiance without replaying effects", () => {
    const bytes = fixture();
    const changes = { "merge.1.faction": 0 };
    const view = san3Adapter.view(bytes, { module: "factions", record: "1", changes });
    expect(view.changes).toEqual(changes);
    expect(view.preview.map(({ key }) => key)).toEqual(
      expect.arrayContaining([
        "merge.1.faction",
        "merge.1.city3",
        "merge.1.officer6.faction",
        "merge.1.rulerRole",
        "merge.1.cleanup2.originFaction",
        "merge.1.contract0.alliance",
        "merge.1.contract0.joint",
        "merge.1.contract0.targetReference",
      ]),
    );
    const result = new San3Document(san3Adapter.apply(bytes, { changes: view.changes }));
    expect(result.faction(1).active).toBe(false);
    expect(result.city(3).faction).toBe(0);
    expect(result.officer(6)).toMatchObject({ soldiers: 3000, faction: 0, role: 3 });
    expect(bytes).toEqual(fixture());
  });

  it("locks the current turn faction and refuses derived or unrelated draft inputs", () => {
    const bytes = fixture();
    expect(
      san3Adapter
        .view(bytes, { module: "factions", record: "0" })
        .fields.find(({ columnId }) => columnId === "mergeFaction")?.readonly,
    ).toBe(true);
    expect(
      san3Adapter
        .view(bytes, { module: "factions", record: "1" })
        .fields.find(({ columnId }) => columnId === "mergeFaction")?.readonly,
    ).toBe(false);
    for (const changes of [
      { "merge.0.faction": 1 },
      { "merge.1.faction": 0, "merge.1.city3": 0 },
      { "merge.1.faction": 0, "city.0.gold": 1 },
      { "merge.21.faction": 0 },
    ])
      expect(() => san3Adapter.apply(bytes, { changes })).toThrow();
    expect(san3Adapter.view(bytes, { changes: { "merge.1.faction": 1 } }).changes).toEqual({});
  });

  it("reports only changed agreements and all alliances removed from the absorbed faction", () => {
    const bytes = fixture();
    bytes[san3Layout.factions.offset + 36] = 255;
    const source = san3Layout.factions.offset + 50;
    new DataView(bytes.buffer).setUint32(source + 6, 1);
    const view = san3Adapter.view(bytes, { module: "factions", changes: { "merge.1.faction": 0 } });
    expect(view.preview.some(({ key }) => key.endsWith(".joint"))).toBe(false);
    expect(view.preview.map(({ key }) => key)).toContain("merge.1.contract1.alliance");
    const effects = Object.fromEntries(view.preview.map(({ key, ...effect }) => [key, effect]));
    expect(effects["merge.1.city3.delegation"]).toMatchObject({ before: 1, after: 2 });
  });
});
