import { expect, it } from "vitest";
import { displayNumber, normalizeNumber } from "../../client/controls/numbers.ts";

it("clamps positive and negative pasted numbers without overflowing", () => {
  const range = { min: -100, max: 100 };
  expect(normalizeNumber("9".repeat(400), range)).toEqual({
    raw: 100,
    text: "100",
    adjusted: true,
  });
  expect(normalizeNumber(`-${"9".repeat(400)}`, range)).toEqual({
    raw: -100,
    text: "-100",
    adjusted: true,
  });
  expect(normalizeNumber(" +0010 ", range)).toEqual({ raw: 10, text: "10", adjusted: false });
  expect(normalizeNumber("-0", range).raw).toBe(0);
});
it("uses exact storage steps for salary and decimal supplies", () => {
  const salary = { min: 0, max: 255, multiplier: 10 };
  expect(normalizeNumber("1230", salary)).toEqual({ raw: 123, text: "1230", adjusted: false });
  expect(normalizeNumber("1234", salary)).toEqual({ raw: 123, text: "1230", adjusted: true });
  expect(normalizeNumber("9999", salary).text).toBe("2550");
  const water = { min: 0, max: 32760, divisor: 10 };
  expect(normalizeNumber("123.4", water)).toEqual({ raw: 1234, text: "123.4", adjusted: false });
  expect(normalizeNumber(".15", water)).toEqual({ raw: 2, text: "0.2", adjusted: true });
  expect(normalizeNumber("4000", water).text).toBe("3276");
  expect(displayNumber(4294967295, { min: 0, max: 600000000 })).toBe("4294967295");
});
it.each(["", "-", ".", "hello", "1,000", "1e6", "NaN", "Infinity", "1.2.3"])(
  "rejects unfinished or nonnumeric input %j",
  (value) => {
    expect(() => normalizeNumber(value, { min: 0, max: 100 })).toThrow("controls.enterNumber");
  },
);
