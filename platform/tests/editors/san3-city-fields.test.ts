import { describe, expect, it } from "vitest";
import { cityDetailFields } from "../../src/editors/san3/city-fields.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { editSan3 } from "../../src/editors/san3/fields.ts";

/** Generated empty strategic structure; no proprietary game records or instructions. */
function fixture() {
  const bytes = new Uint8Array(san3Layout.size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0x78000, 0x4b4f4549);
  view.setUint32(0x78776, 0x4b4f4549);
  view.setUint16(0x78788, 200);
  for (let index = 0; index < san3Layout.factions.count; index++)
    view.setUint16(san3Layout.factions.offset + index * san3Layout.factions.stride, 0xffff);
  view.setUint16(san3Layout.factions.offset, 0);
  view.setUint32(san3Layout.factions.offset + 2, san3Layout.cities.offset);
  for (let index = 0; index < san3Layout.cities.count; index++) {
    const offset = san3Layout.cities.offset + index * san3Layout.cities.stride;
    for (const relative of [4, 6, 8, 10]) view.setUint16(offset + relative, 0xffff);
    bytes[offset + 0x14] = index === 0 ? 0 : 0xff;
    bytes.fill(34, offset + 0x1c, offset + 0x34);
    bytes[offset + 0x2a] = 165;
    bytes[offset + 0x33] = 90;
  }
  return bytes;
}

const expectedFields = [
  ["development", 0x1c, 1, 100],
  ["cultivation", 0x1d, 1, 100],
  ["irrigation", 0x1e, 1, 100],
  ["floodProtection", 0x1f, 1, 100],
  ["commerce", 0x20, 2, 9999],
  ["taxRate", 0x22, 1, 100],
  ["popularLoyalty", 0x23, 1, 100],
  ["crossbows", 0x24, 2, 9999],
  ["heavyCrossbows", 0x26, 2, 9999],
  ["warhorses", 0x28, 2, 9999],
  ["heavyWarships", 0x2b, 1, 100],
  ["mediumWarships", 0x2c, 1, 100],
  ["lightWarships", 0x2d, 1, 100],
  ["foodSellPrice", 0x2e, 1, 255],
  ["foodBuyPrice", 0x2f, 1, 255],
  ["crossbowPrice", 0x30, 1, 255],
  ["heavyCrossbowPrice", 0x31, 1, 255],
  ["warhorsePrice", 0x32, 1, 255],
] as const;

describe("Japanese Mega-CD city economy and equipment", () => {
  it("exposes bounded scalars for both ends of the city table", () => {
    const document = new San3Document(fixture());
    for (const index of [0, 45]) {
      const fields = cityDetailFields(document, index);
      expect(fields).toHaveLength(18);
      for (const [id, relative, width, max] of expectedFields) {
        expect(fields.find((field) => field.columnId === id)).toMatchObject({
          key: `city.${index}.${id}`,
          offset: san3Layout.cities.offset + index * 0x34 + relative,
          width,
          value: width === 1 ? 34 : 0x2222,
          min: relative >= 0x2e ? 1 : 0,
          max,
        });
      }
    }
    for (const index of [-1, 46, 0.5, Number.NaN])
      expect(() => cityDetailFields(document, index)).toThrow();
  });

  it("publishes maximum values without changing adjacent unknowns or other cities", () => {
    const original = fixture();
    const document = new San3Document(original);
    const changes = Object.fromEntries(
      expectedFields.map(([id, , , max]) => [`city.45.${id}`, max]),
    );
    const result = editSan3(document, changes);
    const expected = original.slice();
    const view = new DataView(expected.buffer);
    const offset = san3Layout.cities.offset + 45 * 0x34;
    for (const [, relative, width, max] of expectedFields) {
      if (width === 1) view.setUint8(offset + relative, max);
      else view.setUint16(offset + relative, max);
    }
    expect(result.bytes).toEqual(expected);
    expect(document.copy()).toEqual(original);
    expect(result.edits).toHaveLength(18);
    expect(cityDetailFields(new San3Document(result.bytes), 45).map(({ value }) => value)).toEqual(
      expectedFields.map(([, , , max]) => max),
    );
  });

  it("accepts zero quantities and tax but keeps every trade divisor positive", () => {
    const document = new San3Document(fixture());
    const changes = Object.fromEntries(
      expectedFields.map(([id, relative]) => [`city.0.${id}`, relative >= 0x2e ? 1 : 0]),
    );
    const result = editSan3(document, changes);
    expect(cityDetailFields(new San3Document(result.bytes), 0).map(({ value }) => value)).toEqual(
      expectedFields.map(([, relative]) => (relative >= 0x2e ? 1 : 0)),
    );
  });

  it("rejects invalid mixed drafts atomically and excludes relationship fields", () => {
    const original = fixture();
    const document = new San3Document(original);
    for (const [id, relative, , max] of expectedFields) {
      for (const value of [max + 1, relative >= 0x2e ? 0 : -1, 1.5, Number.NaN]) {
        expect(() => editSan3(document, { "city.0.gold": 50, [`city.0.${id}`]: value })).toThrow();
      }
    }
    for (const id of ["unknown42", "unknown51", "governor", "faction", "nextCity"]) {
      expect(() => editSan3(document, { "city.0.gold": 50, [`city.0.${id}`]: 1 })).toThrow();
    }
    expect(document.copy()).toEqual(original);
  });
});
