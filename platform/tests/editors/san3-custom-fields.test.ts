import { describe, expect, it } from "vitest";
import {
  customMetadataFields,
  validateCustomFields,
} from "../../src/editors/san3/custom-fields.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";

/** Generated memory structure, with deliberately synthetic portrait IDs. */
function fixture() {
  const bytes = new Uint8Array(san3Layout.size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0x78000, 0x4b4f4549);
  view.setUint32(0x78776, 0x4b4f4549);
  view.setUint16(0x78788, 200);
  for (let index = 1; index < san3Layout.factions.count; index++)
    view.setUint16(san3Layout.factions.offset + index * san3Layout.factions.stride, 0xffff);
  view.setUint32(san3Layout.factions.offset + 2, san3Layout.cities.offset);
  for (let index = 1; index < san3Layout.cities.count; index++)
    bytes[san3Layout.cities.offset + index * san3Layout.cities.stride + 0x14] = 0xff;
  for (let index = 0; index < san3Layout.custom.count; index++) {
    const offset = san3Layout.custom.offset + index * san3Layout.custom.stride;
    view.setUint16(offset, 0xffff);
    bytes.set([0xc7, 1, 50, 50, 50, 50, 50, 50, 1, 31, 20], offset + 2);
  }
  for (let index = 0; index < 311; index++) view.setUint16(0x478f0 + index * 2, 0x8000 + index);
  view.setUint16(san3Layout.historical.offset, 1);
  view.setUint16(san3Layout.historical.offset + 30, 0x8001);
  view.setUint16(san3Layout.historical.offset + 60, 0xc000);
  return bytes;
}

describe("custom officer metadata", () => {
  it("edits defaults without activating unused records or exposing their unknown byte", () => {
    const bytes = fixture();
    const document = new San3Document(bytes);
    const fields = customMetadataFields(document, 0);
    expect(fields.map((field) => field.columnId)).toEqual([
      "gender",
      "birthMonth",
      "birthDay",
      "age",
      "portrait",
    ]);
    expect(fields.at(-1)).toMatchObject({ value: 0xffff, readonly: true });
    validateCustomFields(document, { "custom.0.gender": 0, "custom.0.age": 99 });
    expect(() => validateCustomFields(document, { "custom.0.portrait": 231 })).toThrow();
    expect(() => validateCustomFields(document, { "custom.0.unknown": 0 })).toThrow();
    expect(document.copy()).toEqual(bytes);
    expect(fields.some((field) => field.offset === san3Layout.custom.offset + 2)).toBe(false);
  });

  it("validates the final birthday in either draft order and updates the day maximum", () => {
    const document = new San3Document(fixture());
    const changes = { "custom.0.birthMonth": 2, "custom.0.birthDay": 29 };
    expect(() => validateCustomFields(document, changes)).not.toThrow();
    expect(() =>
      validateCustomFields(document, Object.fromEntries(Object.entries(changes).reverse())),
    ).not.toThrow();
    expect(
      customMetadataFields(document, 0, changes).find((field) => field.columnId === "birthDay")
        ?.max,
    ).toBe(29);
    expect(() => validateCustomFields(document, { "custom.0.birthMonth": 2 })).toThrow();
    expect(() => validateCustomFields(document, { ...changes, "custom.0.birthDay": 30 })).toThrow();
    expect(() =>
      validateCustomFields(document, { "custom.0.birthMonth": 4, "custom.0.birthDay": 31 }),
    ).toThrow();
    expect(() =>
      validateCustomFields(document, { "custom.0.birthMonth": 4, "custom.0.birthDay": 30 }),
    ).not.toThrow();
  });

  it("offers verified fixed and looked-up portraits only for registered records", () => {
    const bytes = fixture();
    new DataView(bytes.buffer).setUint16(san3Layout.custom.offset, 231);
    const document = new San3Document(bytes);
    const portrait = customMetadataFields(document, 0).at(-1);
    expect(portrait?.readonly).toBe(false);
    expect(portrait?.choices?.map((choice) => choice.value)).toContain(0x8001);
    expect(portrait?.choices?.map((choice) => choice.value)).not.toContain(0xc000);
    for (const value of [1, 231, 306, 0x8001])
      expect(() => validateCustomFields(document, { "custom.0.portrait": value })).not.toThrow();
    for (const value of [0, 230, 308, 0xc000, 0xffff])
      expect(() => validateCustomFields(document, { "custom.0.portrait": value })).toThrow();
    new DataView(bytes.buffer).setUint16(0x478f0, 0);
    expect(() => customMetadataFields(new San3Document(bytes), 0)).toThrow();
  });

  it("rejects malformed indices and metadata values without writing memory", () => {
    const document = new San3Document(fixture());
    const before = document.copy();
    for (const index of [-1, 1.5, 68, Number.NaN])
      expect(() => customMetadataFields(document, index)).toThrow();
    for (const changes of [
      { "custom.0.gender": 2 },
      { "custom.0.gender": -1 },
      { "custom.0.age": 0 },
      { "custom.0.age": 100 },
      { "custom.0.age": 1.5 },
      { "custom.0.birthMonth": 0 },
      { "custom.0.birthMonth": 13 },
      { "custom.0.birthDay": 0 },
      { "custom.68.age": 20 },
      { "custom.00.age": 20 },
    ])
      expect(() => validateCustomFields(document, changes)).toThrow();
    expect(document.copy()).toEqual(before);
  });
});
