import { describe, expect, it } from "vitest";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { san3Layout } from "../../src/editors/san3/document.ts";
import { governanceCity, san3GovernanceFixture } from "./san3-governance-fixture.ts";
import { san3TurnOrderFixture } from "./san3-turn-order-fixture.ts";

describe("SAN3 unavailable capabilities", () => {
  it("keeps founding, succession and diplomacy discoverable in active and unused slots", () => {
    const bytes = san3GovernanceFixture();
    const active = san3Adapter.view(bytes, { module: "factions", record: "0" });
    const unused = san3Adapter.view(bytes, { module: "factions", record: "2" });
    expect(active.unavailableFields?.map(({ id }) => id)).toEqual([
      "turnPosition",
      "turnState",
      "foundingFounder",
      "foundingControl",
    ]);
    expect(unused.unavailableFields?.map(({ id }) => id)).toEqual([
      "replaceRuler",
      "turnPosition",
      "turnState",
      "alliance",
      "hostility",
    ]);
    expect(active.fields.some(({ key }) => key.startsWith("diplomacy."))).toBe(true);
    expect(unused.fields.find(({ columnId }) => columnId === "foundingFounder")?.readonly).toBe(
      true,
    );
    const ready = san3Adapter.view(san3TurnOrderFixture(), { module: "factions", record: "5" });
    expect(ready.fields.find(({ columnId }) => columnId === "foundingFounder")?.readonly).toBe(
      false,
    );
    expect(ready.unavailableFields?.some(({ id }) => id === "foundingFounder")).toBe(false);
    expect(() => san3Adapter.apply(bytes, { changes: { "founding.0.founder": 4 } })).toThrow();
    expect(() =>
      san3Adapter.apply(bytes, { changes: { "diplomacy.2.hostility.0": 10 } }),
    ).toThrow();
    expect(bytes).toEqual(san3GovernanceFixture());
  });

  it("replaces absent shipbuilding and neutral-city operations with disabled descriptions", () => {
    const bytes = san3GovernanceFixture();
    const view = san3Adapter.view(bytes, { module: "cities" });
    expect(view.unavailableFields?.map(({ id }) => id)).toEqual([
      "incomingGovernor",
      "heavy",
      "medium",
      "light",
    ]);
    const neutral = san3Adapter.view(bytes, { module: "cities", record: "4" });
    expect(neutral.unavailableFields?.some(({ id }) => id === "incomingGovernor")).toBe(false);
    expect(() => san3Adapter.apply(bytes, { changes: { "shipbuilding.0.heavy": 1 } })).toThrow();
    bytes[governanceCity(0) + 21] = 128;
    bytes[governanceCity(0) + 23] = 0;
    bytes[0x7dc0a] = 1;
    const port = san3Adapter.view(bytes, { module: "cities" });
    expect(port.unavailableFields?.map(({ id }) => id)).toEqual(["incomingGovernor"]);
    expect(port.fields.find(({ key }) => key === "shipbuilding.0.heavy")?.value).toBe(0);
  });

  it("never turns absent operations into numeric values, batch keys or accepted writes", () => {
    const bytes = san3GovernanceFixture();
    const view = san3Adapter.view(bytes, { module: "officers", record: "599" });
    const unavailable = view.unavailableFields ?? [];
    expect(unavailable.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "kind",
        "joinGroup",
        "deployCity",
        "establishFaction",
        "appearanceYear",
      ]),
    );
    for (const field of unavailable) {
      expect(field).not.toHaveProperty("value");
      expect(field).not.toHaveProperty("key");
      expect(view.fields.some(({ columnId }) => columnId === field.id)).toBe(false);
      expect(view.batchKeys).not.toContain(field.id);
    }
    for (const changes of [
      { "task.599.kind": 1 },
      { "infiltration.599.deployCity": 4 },
      { "appearance.599.year": 201 },
    ])
      expect(() => san3Adapter.apply(bytes, { changes })).toThrow();
    expect(view.changes).toEqual({});
    expect(view.preview).toEqual([]);
    expect(bytes).toEqual(san3GovernanceFixture());
  });

  it("keeps malformed relationships inspectable without manufacturing turn or task data", () => {
    const bytes = san3GovernanceFixture();
    new DataView(bytes.buffer).setUint16(san3Layout.officers.offset, 600);
    const city = san3Adapter.view(bytes, { module: "cities" });
    expect(city.unavailableFields?.some(({ id }) => id === "transferCity")).toBe(true);
    const officer = san3Adapter.view(bytes, { module: "officers" });
    expect(officer.unavailableFields?.some(({ id }) => id === "recoveryMonths")).toBe(true);
    expect(officer.fields.find(({ columnId }) => columnId === "finishRecovery")?.readonly).toBe(
      true,
    );
    expect(officer.fields.find(({ key }) => key === "officer.0.morale")?.value).toBe(78);
    expect(() => san3Adapter.apply(bytes, { changes: { "state.0.recoveryMonths": 1 } })).toThrow();
  });
});
