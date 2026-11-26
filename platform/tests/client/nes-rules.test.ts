import { expect, it } from "vitest";
import { activeNesCodes } from "../../client/nes-cheats/rules.ts";

function rule(code: string, enabled = true) {
  return { name: "", code, enabled };
}

it("preserves order and permits inactive alternatives", () => {
  expect(activeNesCodes([rule("00fe:19"), rule("00FE:30", false), rule("SXIOPO")])).toEqual([
    "00FE:19",
    "SXIOPO",
  ]);
});
it("rejects malformed codes, duplicates, overlapping active addresses and oversized lists", () => {
  for (const rules of [
    [rule("not a code", false)],
    [rule("AAAAAA"), rule("aaaaaa", false)],
    [rule("0600:02"), rule("0600?02:05")],
    Array(33).fill(rule("AAAAAA")),
  ])
    expect(() => activeNesCodes(rules)).toThrow();
});
