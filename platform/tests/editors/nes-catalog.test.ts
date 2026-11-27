import { expect, it } from "vitest";
import { activeNesCodes, nesCodeGroup } from "../../client/nes-cheats/rules.ts";
import { nesSettingsFor } from "../../src/editors/nes/catalog.ts";
import { inGame, onTitle } from "../../src/editors/nes/catalog-data.ts";

it("offers the two tested starting health values only for the matching Mitsume ga Tooru cartridge", () => {
  const sha = "545f33d21ef9804b114d837455fed456fbd6652e76cb520e6458b416426db5c1";
  const [health] = nesSettingsFor(sha);
  expect(health?.atTitle).toBe(true);
  expect(health?.choices.map((choice) => choice.code)).toEqual(["007A:02", "007A:06"]);
  for (const other of [sha.slice(1), sha.toUpperCase(), "Mitsume ga Tooru", "__proto__"]) {
    expect(nesSettingsFor(other)).toEqual([]);
  }
});

it("keeps each release's settings unique and each complete choice usable by the core", () => {
  for (const sha of new Set([...Object.keys(inGame), ...Object.keys(onTitle)])) {
    expect(sha).toMatch(/^[a-f0-9]{64}$/);
    const settings = nesSettingsFor(sha);
    expect(new Set(settings.map((setting) => setting.label)).size).toBe(settings.length);
    for (const { choices } of settings) {
      expect(choices.length).toBeGreaterThan(0);
      expect(new Set(choices.map((choice) => choice.code)).size).toBe(choices.length);
      for (const choice of choices) {
        const codes = activeNesCodes([{ name: "", code: choice.code, enabled: true }]);
        expect(codes.join("+")).toBe(choice.code);
        expect(nesCodeGroup(choice.code)).toEqual(codes);
      }
    }
  }
});
