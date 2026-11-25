import { expect, it } from "vitest";
import { EiketsudenDocument, layout } from "../../src/editors/eiketsuden/document.ts";
import { eiketsudenFixture } from "./eiketsuden-fixture.ts";

it("reads the original DOS money and all 384 character boundaries", () => {
  const document = new EiketsudenDocument(eiketsudenFixture());
  expect(document.money()).toBe(500);
  expect(document.character(0)).toEqual({
    faction: 0,
    role: 0,
    troops: 500,
    troopClass: 0,
    level: 1,
    experience: 0,
    items: [12, 255, 255, 255, 255, 255, 255, 255],
  });
  expect(document.characterOffset(383)).toBe(0x2183);
  expect(document.character(383).troops).toBe(500);
  expect(document.inParty(0)).toBe(true);
  expect(document.inParty(2)).toBe(true);
  expect(document.inParty(3)).toBe(false);
});

it("copies buffer views and preserves every unrelated byte and unknown item ID", () => {
  const bytes = eiketsudenFixture();
  bytes[1_685 + 11] = 200;
  const large = new Uint8Array(bytes.length + 31);
  large.set(bytes, 17);
  const document = new EiketsudenDocument(large.subarray(17, 17 + bytes.length));
  expect(document.copy()).toEqual(bytes);
  expect(document.character(0).items[1]).toBe(200);
  large.fill(0);
  document.copy().fill(0);
  expect(document.copy()).toEqual(bytes);
});

it("rejects empty, truncated, extended and unrelated layouts", () => {
  for (const bytes of [
    new Uint8Array(),
    new Uint8Array(layout.size),
    eiketsudenFixture().subarray(1),
    new Uint8Array(layout.size + 1),
  ])
    expect(() => new EiketsudenDocument(bytes)).toThrow();
});

it("checks record structure at both ends without guessing opaque state flags", () => {
  for (const index of [0, 383]) {
    for (const [field, value] of [
      [0, 0x8f],
      [1, 6],
      [7, 19],
      [8, 0],
      [8, 100],
      [9, 100],
    ]) {
      const bytes = eiketsudenFixture();
      bytes[1_685 + index * 18 + (field ?? 0)] = value ?? 0;
      expect(() => new EiketsudenDocument(bytes)).toThrow();
    }
  }
  const bytes = eiketsudenFixture();
  bytes[1_685 + 2] = 255;
  bytes[1_685 + 3] = 255;
  bytes[1_685 + 4] = 255;
  expect(new EiketsudenDocument(bytes).copy()).toEqual(bytes);
});

it("bounds record requests and preserves full-width unsigned stored values", () => {
  const bytes = eiketsudenFixture();
  const data = new DataView(bytes.buffer);
  data.setUint16(35, 65_535, true);
  data.setUint16(1_690, 65_535, true);
  const document = new EiketsudenDocument(bytes);
  expect(document.money()).toBe(65_535);
  expect(document.character(0).troops).toBe(65_535);
  for (const index of [-1, 384, 0.5, Number.NaN, Number.POSITIVE_INFINITY])
    expect(() => document.character(index)).toThrow();
});
