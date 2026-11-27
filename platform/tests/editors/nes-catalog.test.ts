import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { activeNesCodes, nesCodeGroup } from "../../client/nes-cheats/rules.ts";
import { nesSettingsFor } from "../../src/editors/nes/catalog.ts";
import { inGame, onTitle } from "../../src/editors/nes/catalog-data.ts";

it("has translated labels for every setting and named choice", () => {
  for (const locale of ["en", "zh-CN"]) {
    const labels: Record<string, string> = {};
    for (const name of ["nes-cheats", "nes-presets"]) {
      const url = new URL(`../../client/locales/${locale}/${name}.json`, import.meta.url);
      Object.assign(labels, JSON.parse(readFileSync(url, "utf8")));
    }
    for (const digest of new Set([...Object.keys(inGame), ...Object.keys(onTitle)])) {
      for (const setting of nesSettingsFor(digest)) {
        expect(labels[setting.label]?.trim()).toBeTruthy();
        for (const { label } of setting.choices)
          if (typeof label !== "string") expect(labels[label.messageId]?.trim()).toBeTruthy();
      }
    }
  }
});

it("keeps Mario's starting lives and current size independent", () => {
  const sha = "f61548fdf1670cffefcc4f0b7bdcdd9eaba0c226e3b74f8666071496988248de";
  expect(nesSettingsFor(sha).map(({ label, atTitle }) => [label, atTitle])).toEqual([
    ["nesCheats.marioSize", false],
    ["nesCheats.marioStartingLives", true],
  ]);
});

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
