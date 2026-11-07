import { describe, expect, it } from "vitest";
import { KoukaiDocument, layout } from "../../src/editors/koukai2/document.ts";
import { numberField, readField, writeField } from "../../src/editors/koukai2/fields.ts";
import { message } from "../../src/shared/messages.ts";
import { editorFixture } from "./fixture.ts";

describe("Koukai2 PC container", () => {
  it("edits all 14 main fields using independently specified bytes", () => {
    const bytes = editorFixture(5, 9);
    const base = 0x97 + 9 * 0x8074;
    const document = new KoukaiDocument(bytes);
    expect(document.slots[9]).toMatchObject({ active: true, hero: 5, date: "11/ 11/1522" });
    expect(document.records(9, "main")[0]?.fields).toHaveLength(14);
    const output = document.render(9, {
      money: 600_000_000,
      trade_fame: 0,
      piracy_fame: 65535,
      adventure_fame: 1024,
      contribution_portugal: -100,
      contribution_spain: 100,
      contribution_ottoman: 0,
      contribution_england: -1,
      contribution_italy: 1,
      contribution_netherlands: 99,
      "date.year": 1580,
      "date.month": 12,
      "date.day": 31,
      "date.time": 71,
    });
    const expected = new Uint8Array(bytes);
    expected.set([0, 70, 195, 35], base + 0x60a);
    expected.set([0, 0, 255, 255, 0, 4, 0, 200, 100, 99, 101, 199], base + 0x5fc);
    expected.set([79, 11, 30, 71], base + 6);
    expect(output).toEqual(expected);
    expect(bytes).toEqual(editorFixture(5, 9));
    expect(document.render(9, {})).toEqual(bytes);
  });
  it("rejects unknown, fractional, out-of-range and empty-slot edits atomically", () => {
    const document = new KoukaiDocument(editorFixture());
    for (const change of [
      { money: -1 },
      { money: 600_000_001 },
      { money: 0.5 },
      { money: Number.NaN },
      { money: 1, unknown: 1 },
      { "date.month": 13 },
    ])
      expect(() => document.render(0, change)).toThrow();
    for (const slot of [-1, 1, 10, 0.5])
      expect(() => document.render(slot, {})).toThrow("koukai2.selectSlot");
    expect(() => document.records(0, "invalid")).toThrow("koukai2.unknownModule");
    expect(document.render(0, {})).toEqual(editorFixture());
  });
  it("rejects unsupported containers while preserving empty slots", () => {
    for (const bytes of [new Uint8Array(), new Uint8Array(layout.size), editorFixture(6)])
      expect(() => new KoukaiDocument(bytes)).toThrow();
    for (const date of [
      "00/ 11/1522",
      "11/ 13/1522",
      "11/ 11/0000",
      "1 / 11/1522",
      "xx/ 11/1522",
    ]) {
      const bytes = editorFixture();
      bytes.set(new TextEncoder().encode(date), 1);
      expect(() => new KoukaiDocument(bytes)).toThrow("koukai2.saveHeader");
    }
    const bytes = editorFixture();
    const document = new KoukaiDocument(bytes);
    bytes.fill(0);
    expect(document.render(0, {})).toEqual(editorFixture());
  });
});

it("encodes masks, bias, unsigned values and choices without corrupting adjacent bits", () => {
  const bytes = new Uint8Array([0xa5, 0, 0, 0]);
  const bit = numberField("bit", message("koukai2.skills"), message("koukai2.skills"), 0, 1, 1, {
    mask: 0x10,
    shift: 4,
  });
  expect(readField(bytes, bit)).toBe(0);
  writeField(bytes, bit, 1);
  expect(bytes[0]).toBe(0xb5);
  const country = numberField(
    "country",
    message("koukai2.nationality"),
    message("koukai2.status"),
    0,
    1,
    6,
    {
      mask: 7,
      writeOr: 0x60,
      preserveBits: false,
      choices: [{ value: 2, label: message("koukai2.nationality") }],
    },
  );
  writeField(bytes, country, 2);
  expect(bytes[0]).toBe(0x62);
  expect(() => writeField(bytes, country, 3)).toThrow();
  expect(() => writeField(bytes, { ...bit, readonly: true }, 0)).toThrow();
  const full = numberField("full", "Value", "Test", 0, 4);
  writeField(bytes, full, 0xffffffff);
  expect(readField(bytes, full)).toBe(0xffffffff);
  for (const offset of [-1, 0.5, 4])
    expect(() => readField(bytes, { ...full, offset })).toThrow("koukai2.fieldBounds");
});
