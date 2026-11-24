import { describe, expect, it } from "vitest";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3Document } from "../../src/editors/san3/document.ts";
import { succeedSan3Ruler } from "../../src/editors/san3/ruler-change.ts";
import { san3GovernanceFixture } from "./san3-governance-fixture.ts";

describe("SAN3 cross-city succession previews", () => {
  it("offers other owned cities and explains all leadership changes as effects", () => {
    const bytes = san3GovernanceFixture();
    const initial = san3Adapter.view(bytes, { module: "factions", record: "0" });
    const choices = initial.fields.find(({ columnId }) => columnId === "replaceRuler")?.choices;
    expect(choices?.map(({ value }) => value)).toEqual([0, 3, 4, 5, 8]);
    const changes = { "ruler.0.officer": 4 };
    const preview = san3Adapter.view(bytes, { module: "factions", record: "0", changes });
    expect(preview.changes).toEqual(changes);
    expect(preview.preview.map(({ key }) => key)).toEqual(
      expect.arrayContaining([
        "ruler.0.capital",
        "ruler.0.city1.governor",
        "ruler.0.city1.advisor",
        "ruler.0.city0.delegation",
        "ruler.0.3.role",
      ]),
    );
    expect(preview.preview.filter(({ key }) => key === "ruler.0.officer")).toHaveLength(1);
    const applied = new San3Document(san3Adapter.apply(bytes, { changes: preview.changes }));
    expect(applied.faction(0).ruler).toBe(4);
    expect(applied.officer(0)).toMatchObject({ city: 0, role: 3, soldiers: 3000 });
    expect(applied.officer(4)).toMatchObject({ city: 1, role: 0, soldiers: 3000 });
    expect(bytes).toEqual(san3GovernanceFixture());
  });

  it("rejects inactive factions and direct writes to derived capital and advisor effects", () => {
    const bytes = san3GovernanceFixture();
    expect(() => succeedSan3Ruler(new San3Document(bytes), 2, 4)).toThrow();
    for (const changes of [
      { "ruler.0.capital": 1 },
      { "ruler.0.city1.advisor": 65535 },
      { "ruler.0.officer": 7 },
    ])
      expect(() => san3Adapter.apply(bytes, { changes })).toThrow();
  });
});
