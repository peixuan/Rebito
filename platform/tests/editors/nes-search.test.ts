import { expect, it } from "vitest";
import { nesValueCodes, scanNesRam } from "../../src/editors/nes/search.ts";

it("narrows against each previous observation, never resurrecting discarded addresses", () => {
  const ram = new Uint8Array(2048);
  ram.set([2, 2, 2, 5]);
  const start = scanNesRam(ram, "byte", "exact", 2);
  ram.set([1, 2, 3, 2]);
  expect(scanNesRam(ram, "byte", "lower", 0, start).addresses).toEqual([0]);
  expect(scanNesRam(ram, "byte", "unchanged", 0, start).addresses).toEqual([1]);
  const changed = scanNesRam(ram, "byte", "changed", 0, start);
  ram.set([2, 2, 1, 2]);
  expect(scanNesRam(ram, "byte", "higher", 0, changed).addresses).toEqual([0]);
});

it("scans unaligned words, excludes partial words and ignores invalid packed decimal", () => {
  const ram = new Uint8Array(2048);
  ram.set([0x34, 0x12], 2046);
  expect(scanNesRam(ram, "word", "exact", 0x1234).addresses).toEqual([2046]);
  expect(scanNesRam(ram, "word", "any", 0).addresses).toHaveLength(2047);
  ram[0] = 0xca;
  expect(scanNesRam(ram, "bcd", "any", 0).addresses).toHaveLength(2047);
  expect(scanNesRam(ram, "bcd", "exact", 34).addresses).toEqual([2046]);
  expect(nesValueCodes(2046, 0x1234, "word")).toEqual(["07FE:34", "07FF:12"]);
  expect(nesValueCodes(2047, 99, "bcd")).toEqual(["07FF:99"]);
});

it("rejects comparisons without a baseline and out-of-range inputs", () => {
  const ram = new Uint8Array(2048);
  const scan = scanNesRam(ram, "byte", "any", 0);
  expect(() => scanNesRam(ram, "byte", "lower", 0)).toThrow();
  expect(() => scanNesRam(ram, "word", "higher", 0, scan)).toThrow();
  expect(() => scanNesRam(ram, "byte", "exact", 256)).toThrow();
  expect(() => scanNesRam(ram.slice(1), "byte", "exact", 0)).toThrow();
  expect(() => nesValueCodes(2047, 9, "word")).toThrow();
  expect(() => nesValueCodes(0, 100, "bcd")).toThrow();
  expect(() => nesValueCodes(-1, 0, "byte")).toThrow();
});
