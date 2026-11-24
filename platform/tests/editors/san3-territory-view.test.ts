import { describe, expect, it } from "vitest";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { inspectSan3Lists } from "../../src/editors/san3/relocation.ts";
import { san3TreasureLayout } from "../../src/editors/san3/treasures.ts";
import { governanceOfficer, san3GovernanceFixture } from "./san3-governance-fixture.ts";

function fixture() {
  const bytes = san3GovernanceFixture();
  const data = new DataView(bytes.buffer);
  for (let index = 1; index < 13; index++)
    data.setUint16(san3TreasureLayout.owners + index * 2, 65535);
  return bytes;
}

describe("SAN3 territory operation previews", () => {
  it("transfers a city with canonical ownership and named officer allegiance effects", () => {
    const bytes = fixture();
    const changes = { "ownership.1.faction": 1 };
    const view = san3Adapter.view(bytes, { module: "cities", record: "1", changes });
    expect(view.changes).toEqual(changes);
    expect(view.preview.map(({ key }) => key)).toEqual(
      expect.arrayContaining([
        "ownership.1.faction",
        "ownership.1.3.faction",
        "ownership.1.4.loyalty",
        "ownership.1.5.serviceYears",
      ]),
    );
    const result = new San3Document(san3Adapter.apply(bytes, { changes: view.changes }));
    expect(result.city(1).faction).toBe(1);
    expect(result.officer(4)).toMatchObject({ faction: 1, soldiers: 3000, loyalty: 100 });
    for (const city of [0, 3])
      expect(
        san3Adapter
          .view(bytes, { module: "cities", record: String(city) })
          .fields.find(({ columnId }) => columnId === "transferCity")?.readonly,
      ).toBe(true);
  });

  it("abandons a city without deleting residents or disguising disbanding as a scalar edit", () => {
    const bytes = fixture();
    bytes[san3Layout.factions.offset + 36] = 1;
    bytes[san3Layout.factions.offset + 37] = 1;
    const original = bytes.slice();
    const changes = { "ownership.1.faction": 255 };
    const view = san3Adapter.view(bytes, { module: "cities", record: "1", changes });
    expect(view.changes).toEqual(changes);
    const effects = Object.fromEntries(view.preview.map(({ key, ...effect }) => [key, effect]));
    expect(effects).toMatchObject({
      "ownership.1.3.soldiers": { before: 3000, after: 0 },
      "ownership.1.city1.advisor": expect.any(Object),
      "ownership.1.contract0.joint": { before: 1, after: 0 },
    });
    const result = new San3Document(san3Adapter.apply(bytes, { changes: view.changes }));
    expect(inspectSan3Lists(result).cities[1]).toMatchObject({
      faction: 255,
      serving: [],
      free: [3, 4, 5],
    });
    expect(result.read(san3Layout.factions.offset + 36, 1)).toBe(255);
    expect(bytes).toEqual(original);
  });

  it("claims a neutral city with an explicit governor and rejects incomplete or mixed plans", () => {
    const bytes = fixture();
    const changes = { "ownership.4.faction": 1, "ownership.4.governor": 9 };
    const view = san3Adapter.view(bytes, { module: "cities", record: "4", changes });
    expect(view.changes).toEqual(changes);
    const result = new San3Document(san3Adapter.apply(bytes, { changes: view.changes }));
    expect(result.officer(9)).toMatchObject({ city: 4, faction: 1, role: 4, soldiers: 0 });
    for (const bad of [
      { "ownership.4.faction": 1 },
      { "ownership.4.governor": 9 },
      { ...changes, "city.4.gold": 5 },
      { ...changes, "ownership.4.9.role": 4 },
    ])
      expect(() => san3Adapter.apply(bytes, { changes: bad })).toThrow();
  });

  it("previews the incoming governor's cleared action and former strategist seat", () => {
    const bytes = fixture();
    bytes[governanceOfficer(4) + 8] = 0x81;
    const changes = { "ownership.4.faction": 0, "ownership.4.governor": 4 };
    const view = san3Adapter.view(bytes, { module: "cities", record: "4", changes });
    expect(view.changes).toEqual(changes);
    const effects = Object.fromEntries(view.preview.map(({ key, ...effect }) => [key, effect]));
    expect(effects).toMatchObject({
      "ownership.4.4.actionComplete": { before: 1, after: 0 },
      "ownership.4.city1.advisor": expect.any(Object),
    });
    expect(san3Adapter.apply(bytes, { changes: view.changes })[governanceOfficer(4) + 8]).toBe(
      0x80,
    );
  });
});
