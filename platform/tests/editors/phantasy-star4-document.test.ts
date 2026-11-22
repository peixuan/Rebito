import { expect, it } from "vitest";
import { PhantasyStar4Document } from "../../src/editors/phantasy-star4/document.ts";
import { phantasyStar4Fixture } from "./phantasy-star4-fixture.ts";

it("reads canonical big-endian RAM, repeated inventory slots and all eleven characters", () => {
  const document = new PhantasyStar4Document(phantasyStar4Fixture());
  expect(document.read(0xf438, 4)).toBe(500);
  expect(document.inventory()).toHaveLength(40);
  expect(document.inventory().slice(0, 4)).toEqual([1, 2, 1, 160]);
  expect(document.read(document.personOffset(10) + 0x0a, 4)).toBe(2560);
  expect(document.read(document.personOffset(10) + 8, 2)).toBe(11);
  expect(document.inParty(0)).toBe(true);
  expect(document.inParty(10)).toBe(false);
});

it("owns its input and copies without changing opaque RAM or buffer boundaries", () => {
  const source = phantasyStar4Fixture();
  const larger = new Uint8Array(source.length + 37);
  larger.set(source, 13);
  const document = new PhantasyStar4Document(larger.subarray(13, 13 + source.length));
  expect(document.copy()).toEqual(source);
  larger.fill(0);
  document.copy().fill(0);
  expect(document.read(0x200, 4)).toBe(0xdeadbeef);
  expect(document.read(0xf438, 4)).toBe(500);
});

it("rejects truncated, extended and uninitialized RAM", () => {
  for (const bytes of [new Uint8Array(0x10000), new Uint8Array(0xffff), new Uint8Array(0x10001)])
    expect(() => new PhantasyStar4Document(bytes)).toThrow();
});

it("rejects invalid party references, gaps, duplicates and out-of-catalog inventory", () => {
  for (const party of [
    [0xff, 0xff, 0xff, 0xff, 0xff],
    [0, 11, 0xff, 0xff, 0xff],
    [0, 0, 0xff, 0xff, 0xff],
    [0, 0xff, 1, 0xff, 0xff],
  ] as const) {
    const bytes = phantasyStar4Fixture();
    bytes.set(party, 0xf40a);
    expect(() => new PhantasyStar4Document(bytes)).toThrow();
  }
  const bytes = phantasyStar4Fixture();
  bytes[0xf437] = 161;
  expect(() => new PhantasyStar4Document(bytes)).toThrow();
});

it("rejects implausible initialized character data and impossible point pairs", () => {
  for (const [relative, value] of [
    [8, 0],
    [8, 100],
    [0x0e, 61],
    [0x10, 0],
    [0x10, 0x8000],
    [0x12, 31],
    [0x14, 0x8000],
  ] as const) {
    const bytes = phantasyStar4Fixture();
    new DataView(bytes.buffer).setUint16(0xf500 + relative, value);
    expect(() => new PhantasyStar4Document(bytes)).toThrow();
  }
  for (const offset of [0xf438, 0xfa0a]) {
    const bytes = phantasyStar4Fixture();
    new DataView(bytes.buffer).setUint32(offset, 10_000_000);
    expect(() => new PhantasyStar4Document(bytes)).toThrow();
  }
});

it("bounds typed reads and character indices", () => {
  const document = new PhantasyStar4Document(phantasyStar4Fixture());
  for (const index of [-1, 11, 0.5, Number.NaN])
    expect(() => document.personOffset(index)).toThrow();
  for (const offset of [-1, 0xffff, 0.5, Number.NaN])
    expect(() => document.read(offset, 2)).toThrow();
  expect(document.read(0xffff)).toBe(0);
});
