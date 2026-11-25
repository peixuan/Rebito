import { describe, expect, it } from "vitest";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { san3BattleFixture } from "./san3-battle-fixture.ts";
import { san3GovernanceFixture } from "./san3-governance-fixture.ts";
import { san3ReserveFixture } from "./san3-reserve-fixture.ts";

describe("SAN3 phase navigation", () => {
  it.each([
    [san3GovernanceFixture, ["cities", "officers", "custom", "factions", "treasures"]],
    [san3BattleFixture, ["battle"]],
    [san3ReserveFixture, ["battle", "reserves"]],
  ] as const)(
    "keeps the full catalog while enforcing capture availability",
    (fixture, available) => {
      const bytes = fixture();
      const original = bytes.slice();
      const view = san3Adapter.view(bytes, {});
      expect(view.modules.map(({ id }) => id)).toEqual([
        "cities",
        "officers",
        "custom",
        "factions",
        "treasures",
        "battle",
        "reserves",
        "presets",
      ]);
      expect(
        view.modules.filter(({ unavailableReason }) => !unavailableReason).map(({ id }) => id),
      ).toEqual(available);
      for (const module of view.modules) {
        expect(module.description).toEqual({ messageId: `san3.navigation.${module.id}` });
        if (!module.unavailableReason) continue;
        expect(() => san3Adapter.view(bytes, { module: module.id })).toThrow();
        expect(() =>
          san3Adapter.apply(bytes, { module: module.id, changes: { "city.0.gold": 2000 } }),
        ).toThrow();
      }
      expect(bytes).toEqual(original);
    },
  );

  it("explains missing reserves separately from the battle phase requirement", () => {
    const missing = san3Adapter
      .view(san3BattleFixture(), {})
      .modules.find(({ id }) => id === "reserves");
    const strategy = san3Adapter
      .view(san3GovernanceFixture(), {})
      .modules.find(({ id }) => id === "reserves");
    expect(missing?.unavailableReason).toEqual({ messageId: "san3.navigation.requiresReserves" });
    expect(strategy?.unavailableReason).toEqual({ messageId: "san3.navigation.requiresBattle" });
  });
});
