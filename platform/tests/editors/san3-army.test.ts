import { describe, expect, it } from "vitest";
import { editSan3Army } from "../../src/editors/san3/army.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";

const officer = san3Layout.officers.offset;
const city = san3Layout.cities.offset;

/** One synthetic faction with its ruler and a military advisor. */
function fixture(soldiers = 0) {
  const bytes = new Uint8Array(san3Layout.size);
  const data = new DataView(bytes.buffer);
  data.setUint32(0x78000, 0x4b4f4549);
  data.setUint32(0x78776, 0x4b4f4549);
  data.setUint16(0x78788, 200);
  for (let index = 0; index < 21; index++)
    data.setUint16(san3Layout.factions.offset + index * 50, 0xffff);
  data.setUint16(san3Layout.factions.offset, 0);
  data.setUint32(san3Layout.factions.offset + 2, city);
  for (let index = 0; index < 46; index++) {
    for (const relative of [4, 6, 8, 10]) data.setUint16(city + index * 52 + relative, 0xffff);
    bytes[city + index * 52 + 20] = index === 0 ? 0 : 255;
  }
  data.setUint16(city + 4, 0);
  data.setUint16(officer, 1);
  data.setUint16(officer + 30, 0xffff);
  data.setUint16(officer + 32, soldiers);
  bytes[officer + 38] = 0x81;
  bytes[officer + 40] = 0x70;
  bytes[officer + 42] = 1;
  bytes[officer + 51] = 50;
  bytes[officer + 52] = 70;
  bytes[san3Layout.historical.offset + 35] = 75;
  bytes[123] = 219;
  return bytes;
}

describe("SAN3 strategic army creation and disbanding", () => {
  it("initializes a new army without changing roles, flags, task state or city resources", () => {
    const original = fixture();
    const document = new San3Document(original);
    const result = editSan3Army(document, 1, { soldiers: 17_500 });
    const expected = original.slice();
    new DataView(expected.buffer).setUint16(officer + 32, 17_500);
    expected[officer + 51] = 0;
    expected[officer + 52] = 0;
    expect(result.bytes).toEqual(expected);
    expect(document.copy()).toEqual(original);
    const explicit = editSan3Army(document, 1, { soldiers: 100, training: 100, morale: 120 });
    expect(new San3Document(explicit.bytes).officer(1)).toMatchObject({
      soldiers: 100,
      training: 100,
      morale: 120,
    });
  });

  it("clears army training and morale on disband and reports every changed byte", () => {
    const original = fixture(2000);
    const result = editSan3Army(new San3Document(original), 1, { soldiers: 0 });
    expect(new San3Document(result.bytes).officer(1)).toMatchObject({
      soldiers: 0,
      training: 0,
      morale: 0,
    });
    const restored = result.bytes.slice();
    const data = new DataView(restored.buffer);
    for (const { offset, width, before } of result.writes) {
      if (width === 1) data.setUint8(offset, before);
      else data.setUint16(offset, before);
    }
    expect(restored).toEqual(original);
    expect(editSan3Army(new San3Document(original), 1, { soldiers: 2000 }).writes).toEqual([]);
  });

  it("allows a civil governor to command troops while ordinary civil officers remain ineligible", () => {
    const bytes = fixture();
    const data = new DataView(bytes.buffer);
    data.setUint32(city, city + 52);
    data.setUint16(city + 52 + 4, 1);
    bytes[city + 52 + 20] = 0;
    data.setUint16(officer, 0xffff);
    bytes[officer + 42] = 4;
    bytes[officer + 46] = 1;
    const result = editSan3Army(new San3Document(bytes), 1, { soldiers: 1000 });
    expect(new San3Document(result.bytes).officer(1)).toMatchObject({ role: 4, soldiers: 1000 });
  });

  it("rejects ineligible records, malformed graphs, reservations and conflicting drafts", () => {
    const original = fixture(2000);
    const document = new San3Document(original);
    for (const draft of [
      { soldiers: -1 },
      { soldiers: 17_501 },
      { soldiers: 1.5 },
      { soldiers: Number.NaN },
      { soldiers: 0, training: 1 },
      { soldiers: 0, morale: 1 },
      { soldiers: 100, training: 101 },
      { soldiers: 100, morale: 121 },
    ])
      expect(() => editSan3Army(document, 1, draft)).toThrow();
    for (const [relative, value] of [
      [8, 4],
      [8, 8],
      [8, 16],
      [9, 1],
      [9, 64],
      [10, 1],
      [10, 4],
      [12, 4],
      [26, 1],
      [27, 1],
    ] as const) {
      const bytes = original.slice();
      bytes[officer + 30 + relative] = value;
      expect(() => editSan3Army(new San3Document(bytes), 1, { soldiers: 100 })).toThrow();
    }
    const cycle = original.slice();
    new DataView(cycle.buffer).setUint16(officer + 30, 0);
    expect(() => editSan3Army(new San3Document(cycle), 1, { soldiers: 100 })).toThrow();
    expect(document.copy()).toEqual(original);
  });
});
