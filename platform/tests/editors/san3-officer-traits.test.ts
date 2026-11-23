import { describe, expect, it } from "vitest";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { editSan3 } from "../../src/editors/san3/fields.ts";
import {
  officerTraitFields,
  validateOfficerTraits,
} from "../../src/editors/san3/officer-traits.ts";

/** Synthetic strategic structure; no game code or original player progress. */
function fixture() {
  const bytes = new Uint8Array(san3Layout.size);
  const data = new DataView(bytes.buffer);
  data.setUint32(0x78000, 0x4b4f4549);
  data.setUint32(0x78776, 0x4b4f4549);
  data.setUint16(0x78788, 200);
  for (let index = 0; index < san3Layout.factions.count; index++)
    data.setUint16(san3Layout.factions.offset + index * san3Layout.factions.stride, 0xffff);
  data.setUint16(san3Layout.factions.offset, 0);
  data.setUint32(san3Layout.factions.offset + 2, san3Layout.cities.offset);
  for (let index = 0; index < san3Layout.cities.count; index++) {
    const offset = san3Layout.cities.offset + index * san3Layout.cities.stride;
    for (const relative of [4, 6, 8, 10]) data.setUint16(offset + relative, 0xffff);
    bytes[offset + 20] = index === 0 ? 0 : 255;
  }
  bytes.set([60, 70, 80, 50, 40, 30], san3Layout.historical.offset + 5);
  const officer = san3Layout.officers.offset;
  data.setUint16(officer + 2, 2000);
  bytes.set([0xa3, 0xb4, 0xa3, 0, 0xed], officer + 6);
  bytes[officer + 12] = 3;
  bytes[officer + 13] = 150;
  bytes[officer + 14] = 100;
  bytes[officer + 18] = 255;
  bytes[officer + 19] = 0;
  bytes[officer + 20] = 254;
  return bytes;
}

function fields(bytes = fixture()) {
  return officerTraitFields(new San3Document(bytes), 0);
}

describe("SAN3 strategic officer traits", () => {
  it("decodes independent nibbles and the three-bit lifespan category", () => {
    const values = Object.fromEntries(fields().map((field) => [field.columnId, field.value]));
    expect(values).toEqual({
      ambition: 10,
      luck: 3,
      composure: 11,
      bravery: 4,
      lifespan: 6,
      compatibility: 150,
      morality: 100,
      serviceYears: 255,
      originServiceYears: 254,
      actionComplete: 1,
    });
    expect(fields().every((field) => !field.readonly)).toBe(true);
    expect(fields().find((field) => field.columnId === "lifespan")).toMatchObject({
      mask: 7,
      shift: 4,
      min: 0,
      max: 7,
    });
    expect(fields().find((field) => field.columnId === "actionComplete")).toMatchObject({
      mask: 1,
      shift: 0,
      min: 0,
      max: 1,
      boolean: true,
    });
    expect(
      fields()
        .filter((field) => field.columnId.endsWith("Years"))
        .every((field) => field.max === 255),
    ).toBe(true);
  });

  it("keeps dead, battle and unavailable records read-only", () => {
    for (const flag of [0x10, 0x04]) {
      const bytes = fixture();
      bytes[san3Layout.officers.offset + 8] = flag;
      expect(fields(bytes).every((field) => field.readonly)).toBe(true);
    }
    const bytes = fixture();
    bytes[san3Layout.officers.offset + 12] = 255;
    expect(fields(bytes).every((field) => field.readonly)).toBe(true);
    expect(() => officerTraitFields(new San3Document(fixture()), 600)).toThrow();
  });

  it("does not make an assigned officer actionable or edit absent prior service", () => {
    const bytes = fixture();
    bytes[san3Layout.officers.offset + 9] = 0x40;
    bytes[san3Layout.officers.offset + 19] = 255;
    const readonly = fields(bytes)
      .filter((field) => field.readonly)
      .map((field) => field.columnId);
    expect(readonly).toEqual(["originServiceYears", "actionComplete"]);
  });

  it("preserves out-of-domain values for inspection instead of silently coercing them", () => {
    const bytes = fixture();
    bytes[san3Layout.officers.offset + 13] = 151;
    bytes[san3Layout.officers.offset + 14] = 101;
    expect(
      fields(bytes)
        .filter((field) => field.readonly)
        .map((field) => field.value),
    ).toEqual([151, 101]);
    expect(bytes[san3Layout.officers.offset + 10]).toBe(0xed);
  });

  it("validates final combined service without rejecting compensating batch edits", () => {
    const document = new San3Document(fixture());
    for (const changes of [
      { "officer.0.serviceYears": 3 },
      { "officer.0.serviceYears": 0, "officer.0.originServiceYears": 0 },
      { "officer.0.serviceYears": 256, "officer.0.originServiceYears": 0 },
      { "officer.0.serviceYears": Number.NaN },
    ])
      expect(() => validateOfficerTraits(document, changes)).toThrow();
    const changes = { "officer.0.serviceYears": 255, "officer.0.originServiceYears": 1 };
    expect(() => validateOfficerTraits(document, changes)).not.toThrow();
    expect(() =>
      validateOfficerTraits(document, Object.fromEntries(Object.entries(changes).reverse())),
    ).not.toThrow();
    expect(() => validateOfficerTraits(document, { "officer.0.ambition": 5 })).not.toThrow();
    const bytes = fixture();
    bytes[san3Layout.officers.offset + 19] = 255;
    expect(() =>
      validateOfficerTraits(new San3Document(bytes), { "officer.0.serviceYears": 255 }),
    ).not.toThrow();
  });

  it("writes adjacent traits and action state without replacing their other bits", () => {
    const bytes = fixture();
    const document = new San3Document(bytes);
    const changes = {
      "officer.0.ambition": 1,
      "officer.0.luck": 15,
      "officer.0.composure": 2,
      "officer.0.bravery": 14,
      "officer.0.lifespan": 7,
      "officer.0.actionComplete": 0,
    };
    const result = editSan3(document, changes);
    expect(editSan3(document, Object.fromEntries(Object.entries(changes).reverse())).bytes).toEqual(
      result.bytes,
    );
    const expected = bytes.slice();
    const offset = san3Layout.officers.offset;
    expected[offset + 6] = 0x1f;
    expected[offset + 7] = 0x2e;
    expected[offset + 8] = 0xa2;
    expected[offset + 10] = 0xfd;
    expect(result.bytes).toEqual(expected);
    expect(document.copy()).toEqual(bytes);
    expect(() => editSan3(document, { "officer.0.lifespan": 8 })).toThrow();
    expect(() => editSan3(document, { "officer.0.actionComplete": 2 })).toThrow();
  });

  it("enforces service guards and distinct training/morale limits through the real editor", () => {
    const document = new San3Document(fixture());
    expect(() =>
      editSan3(document, { "officer.0.luck": 4, "officer.0.serviceYears": 3 }),
    ).toThrow();
    const changes = { "officer.0.serviceYears": 255, "officer.0.originServiceYears": 1 };
    expect(editSan3(document, changes).bytes).toEqual(
      editSan3(document, Object.fromEntries(Object.entries(changes).reverse())).bytes,
    );
    expect(() =>
      editSan3(document, { "officer.0.morale": 120, "officer.0.training": 100 }),
    ).not.toThrow();
    expect(() => editSan3(document, { "officer.0.morale": 121 })).toThrow();
    expect(() => editSan3(document, { "officer.0.training": 101 })).toThrow();
  });
});
