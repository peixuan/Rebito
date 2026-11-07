import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// These counts come from the save format, not the UI's current array lengths.
for (const [name, count, locales] of [
  ["personNames", 120, ["shared"]],
  ["portNames", 100, ["shared"]],
  ["shipNames", 25, ["en", "zh-CN"]],
  ["cannons", 8, ["en", "zh-CN"]],
  ["figureheads", 11, ["en", "zh-CN"]],
] as const) {
  it(`provides a label for every format-defined ${name} ID`, () => {
    const keys = Array.from({ length: count }, (_, index) => `koukai2.${name}.${index}`).sort();
    for (const locale of locales) {
      const catalog: Record<string, string> = JSON.parse(
        readFileSync(`client/locales/${locale}/editors/${name}.json`, "utf8"),
      );
      expect(Object.keys(catalog).sort(), locale).toEqual(keys);
      for (const value of Object.values(catalog)) expect(value.trim().length).toBeGreaterThan(0);
    }
  });
}
