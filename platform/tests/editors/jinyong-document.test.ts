import { expect, it } from "vitest";
import { JinyongDocument } from "../../src/editors/jinyong/document.ts";
import { jinyongFixture } from "./jinyong-fixture.ts";

it("reads original DOS boundaries without treating inventory as a separate money word", () => {
  const document = new JinyongDocument(jinyongFixture());
  expect(document.name("persons", 319)).toBe("Test319");
  expect(document.name("items", 199)).toBe("Test199");
  expect(document.name("skills", 92)).toBe("Test92");
  expect(document.word(0x366)).toBe(32);
  expect(document.inventory()[0]).toEqual({ id: 174, amount: 100 });
  expect(document.inventory()[199]).toEqual({ id: -1, amount: 0 });
  expect(document.inParty(0)).toBe(true);
  expect(document.inParty(1)).toBe(false);
});

it("owns its bytes and preserves every byte when merely reading a save", () => {
  const source = jinyongFixture();
  const document = new JinyongDocument(source);
  const copy = document.copy();
  expect(copy).toEqual(source);
  source.fill(0);
  copy.fill(0);
  expect(document.word(0x366)).toBe(32);
});

it("handles a view into a larger buffer and bounds every named record", () => {
  const source = jinyongFixture();
  const larger = new Uint8Array(source.length + 30);
  larger.set(source, 11);
  const document = new JinyongDocument(larger.subarray(11, 11 + source.length));
  expect(document.name("persons", 0)).toBe("Test0");
  for (const index of [-1, 320, 0.5, Number.NaN])
    expect(() => document.name("persons", index)).toThrow();
});

it("rejects truncated, extended, empty and wrong record layouts", () => {
  for (const bytes of [new Uint8Array(), new Uint8Array(114_242), jinyongFixture().slice(1)])
    expect(() => new JinyongDocument(bytes)).toThrow();
  expect(() => new JinyongDocument(new Uint8Array(114_244))).toThrow();
  for (const offset of [836, 59_074, 59_076, 97_074, 97_076, 101_444, 113_956]) {
    const bytes = jinyongFixture();
    new DataView(bytes.buffer).setInt16(offset, -1, true);
    // The final word of a table is opaque; only record identifiers identify the layout.
    if ([59_074, 97_074].includes(offset)) expect(new JinyongDocument(bytes).copy()).toEqual(bytes);
    else expect(() => new JinyongDocument(bytes)).toThrow();
  }
});

it("rejects broken party references, duplicate bag entries and invalid quantities", () => {
  for (const [offset, value] of [
    [24, 1],
    [26, 320],
    [36, 200],
    [40, 174],
    [38, -1],
  ] as const) {
    const bytes = jinyongFixture();
    new DataView(bytes.buffer).setInt16(offset, value, true);
    expect(() => new JinyongDocument(bytes)).toThrow();
  }
});

it("decodes Big5 names without exposing control characters", () => {
  const bytes = jinyongFixture();
  bytes.set([0x41, 0x01, 0xa4, 0x40, 0], 844);
  expect(new JinyongDocument(bytes).name("persons", 0)).toBe("A\u4e00");
});
