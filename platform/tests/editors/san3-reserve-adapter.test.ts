import { describe, expect, it } from "vitest";
import { san3BattleAdapter } from "../../src/editors/san3/battle-adapter.ts";
import { san3Layout } from "../../src/editors/san3/document.ts";
import { san3BattleFixture } from "./san3-battle-fixture.ts";
import { san3ReserveFixture } from "./san3-reserve-fixture.ts";

describe("SAN3 reserve editor view", () => {
  it("keeps scalar edits available when unrelated city data cannot enable reserve controls", () => {
    for (const naval of [false, true]) {
      const bytes = san3ReserveFixture();
      const data = new DataView(bytes.buffer);
      if (naval) data.setUint16(0x52056, 1);
      else data.setUint16(san3Layout.cities.offset + 4, 600);
      const view = san3BattleAdapter.view(bytes, { changes: { "battle.0.mobility": 90 } });
      expect(view.modules.map(({ id }) => id)).toEqual(["battle"]);
      const result = san3BattleAdapter.apply(bytes, { changes: view.changes });
      const expected = bytes.slice();
      expected[san3Layout.officers.offset + 23] = 90;
      expect(result).toEqual(expected);
      expect(() => san3BattleAdapter.view(bytes, { module: "reserves" })).toThrow();
      expect(() =>
        san3BattleAdapter.apply(bytes, {
          changes: { "battle.0.mobility": 90, "reserve.3.deploymentUsed": 1 },
        }),
      ).toThrow();
    }
  });

  it("keeps reserve selection separate from deployed combat records", () => {
    const bytes = san3ReserveFixture();
    const view = san3BattleAdapter.view(bytes, { module: "reserves" });
    expect(view.module).toBe("reserves");
    expect(view.selected).toBe("3");
    expect(view.modules.map(({ id }) => id)).toEqual(["battle", "reserves"]);
    expect(view.records.map(({ id }) => id)).toEqual(["3", "4"]);
    expect(view.fields).toMatchObject([
      { key: "reserve.3.deploymentUsed", value: 0, min: 0, max: 1 },
    ]);
    expect(view.instructions).toEqual({ messageId: "san3.reserveInstructions" });
    expect(view.fields[0]?.help).toEqual({ messageId: "san3.reserveHelp" });
    const battle = san3BattleAdapter.view(bytes, {});
    expect(battle.records.map(({ id }) => id)).toEqual(["1", "2", "0"]);
    expect(battle.fields.every(({ key }) => key.startsWith("battle."))).toBe(true);
    expect(san3BattleAdapter.view(san3BattleFixture(), {}).modules).toHaveLength(1);
  });

  it("previews and applies cross-module drafts atomically while preserving map bytes", () => {
    const bytes = san3ReserveFixture();
    const original = bytes.slice();
    const view = san3BattleAdapter.view(bytes, {
      module: "reserves",
      record: "4",
      changes: { "reserve.4.deploymentUsed": 1, "battle.0.mobility": 90 },
    });
    expect(view.fields[0]?.value).toBe(1);
    expect(view.preview.map(({ key }) => key).sort()).toEqual([
      "battle.0.mobility",
      "reserve.4.deploymentUsed",
    ]);
    const result = san3BattleAdapter.apply(bytes, { changes: view.changes });
    expect(result[san3Layout.officers.offset + 23]).toBe(90);
    expect(result[san3Layout.officers.offset + 4 * 30 + 8]).toBe(0x85);
    expect(result.subarray(0x4ae44, 0x4ae44 + 440)).toEqual(bytes.subarray(0x4ae44, 0x4ae44 + 440));
    expect(bytes).toEqual(original);
    expect(
      san3BattleAdapter.view(result, { module: "reserves", record: "4" }).fields[0]?.value,
    ).toBe(1);
    expect(() =>
      san3BattleAdapter.apply(bytes, {
        changes: { "reserve.4.deploymentUsed": 1, "battle.0.mobility": 91 },
      }),
    ).toThrow();
    expect(bytes).toEqual(original);
  });

  it("rejects empty, crossed or forged module selections and semantic no-ops", () => {
    const bytes = san3ReserveFixture();
    for (const draft of [
      { module: "reserves", record: "0" },
      { module: "battle", record: "3" },
      { module: "city" },
      { module: "reserves", action: { id: "deploy", record: "3" } },
      { changes: { "reserve.3.flags": 4 } },
      { changes: { "reserve.00.deploymentUsed": 1 } },
    ])
      expect(() => san3BattleAdapter.view(bytes, draft)).toThrow();
    expect(() => san3BattleAdapter.view(san3BattleFixture(), { module: "reserves" })).toThrow();
    expect(() =>
      san3BattleAdapter.apply(bytes, {
        changes: { "reserve.3.deploymentUsed": 0 },
      }),
    ).toThrow(/editor.noChanges/);
  });
});
