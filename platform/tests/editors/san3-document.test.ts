import { describe, expect, it } from "vitest";
import { San3Document, san3Attributes, san3Layout } from "../../src/editors/san3/document.ts";
import { cityFields, editSan3, officerFields } from "../../src/editors/san3/fields.ts";

/** Generated structure only: no game code, names, ROM or real player progress. */
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
    view.setUint16(offset + 0x0c, 700);
    view.setUint16(offset + 0x0e, 1500);
    view.setUint32(offset + 0x10, 25_000);
  }
  for (const index of [0, 1, 532]) {
    const offset = san3Layout.officers.offset + index * san3Layout.officers.stride;
    view.setUint16(offset + 2, 2000);
    bytes[offset + 0x0c] = index === 0 ? 0 : 3;
    bytes[offset + 0x0f] = 94;
    bytes[offset + 0x15] = 55;
    bytes[offset + 0x16] = 55;
    const base =
      index === 532 ? san3Layout.custom.offset : san3Layout.historical.offset + index * 30;
    bytes.set([60, 70, 80, 45, 52, 63], base + (index === 532 ? 4 : 5));
    bytes.set(new TextEncoder().encode("Officer"), base + (index === 532 ? 13 : 15));
  }
  bytes.set(new TextEncoder().encode("City"), san3Layout.territories.offset + 10);
  bytes[123] = 219;
  return bytes;
}

describe("Japanese Mega-CD strategic memory", () => {
  it("decodes resources, read-only associations and both officer tables", () => {
    const document = new San3Document(fixture());
    expect(document.city(0)).toEqual({
      index: 0,
      name: "City",
      faction: 0,
      population: 70_000,
      gold: 1500,
      food: 25_000,
    });
    expect(document.faction(0)).toEqual({ index: 0, ruler: 0, active: true });
    expect(document.faction(1).active).toBe(false);
    for (const index of [1, 532])
      expect(document.officer(index)).toMatchObject({
        name: "Officer",
        available: true,
        soldierLimit: 17_000,
        loyalty: 94,
      });
    expect(cityFields(document, 0)[0]).toMatchObject({ value: 700, multiplier: 100, max: 30_000 });
  });

  it("changes only the seven verified numeric fields and owns its buffers", () => {
    const original = fixture();
    const document = new San3Document(original);
    const changes = {
      "city.0.population": 1234,
      "city.0.gold": 23_456,
      "city.0.food": 123_456,
      "officer.1.soldiers": 8765,
      "officer.1.loyalty": 89,
      "officer.1.training": 67,
      "officer.1.morale": 78,
    };
    const result = editSan3(document, changes);
    const allowed = new Set<number>();
    for (const { field } of result.edits)
      for (let byte = 0; byte < field.width; byte++) allowed.add(field.offset + byte);
    const untouched = result.bytes.slice();
    for (const offset of allowed) untouched[offset] = original[offset] ?? 0;
    expect(untouched).toEqual(original);
    const changed = new San3Document(result.bytes);
    expect(changed.city(0)).toMatchObject({ population: 123_400, gold: 23_456, food: 123_456 });
    expect(changed.officer(1)).toMatchObject({
      soldiers: 8765,
      loyalty: 89,
      training: 67,
      morale: 78,
    });
    expect(document.copy()).toEqual(original);
    result.bytes[123] = 0;
    original[123] = 1;
    expect(document.copy()[123]).toBe(219);
  });

  it("rejects malformed, uninitialized and non-strategic memory", () => {
    expect(() => new San3Document(new Uint8Array(0x10000))).toThrow();
    expect(() => new San3Document(new Uint8Array(san3Layout.size))).toThrow();
    const mutations: [number, number, 1 | 2 | 4][] = [
      [0x78000, 0, 4],
      [0x78776, 0, 4],
      [0x78788, 0, 2],
      [0x7878a, 12, 1],
      [0x4abc4, 1, 2],
      [0x4abc4, 2, 2],
      [0x4abc4, 3, 2],
      [0x4abc4, 4, 2],
      [san3Layout.factions.offset, 600, 2],
      [san3Layout.factions.offset + 2, 0, 4],
      [san3Layout.cities.offset, san3Layout.cities.offset + 1, 4],
      [san3Layout.cities.offset + 4, 600, 2],
      [san3Layout.cities.offset + 0x14, 21, 1],
      [san3Layout.cities.offset + 0x14, 1, 1],
      [san3Layout.cities.offset + 0x0c, 30_001, 2],
      [san3Layout.cities.offset + 0x0e, 50_001, 2],
      [san3Layout.cities.offset + 0x10, 3_000_001, 4],
    ];
    for (const [offset, value, width] of mutations) {
      const bytes = fixture();
      const view = new DataView(bytes.buffer);
      if (width === 1) view.setUint8(offset, value);
      else if (width === 2) view.setUint16(offset, value);
      else view.setUint32(offset, value);
      expect(() => new San3Document(bytes), `${offset.toString(16)}=${value}`).toThrow();
    }
  });

  it("decodes private glyphs and uses the reading only for unknown name bytes", () => {
    const bytes = fixture();
    bytes.set([0xeb, 0x9f, 0], san3Layout.historical.offset + 15);
    bytes.set(new TextEncoder().encode("Reading"), san3Layout.historical.offset + 22);
    expect(new San3Document(bytes).officer(0).name).toBe("\u74d2");
    bytes.set([0xeb, 0xaa, 0], san3Layout.historical.offset + 15);
    expect(new San3Document(bytes).officer(0).name).toBe("Reading");
  });

  it("accepts exact resource and individual soldier limits", () => {
    const result = editSan3(new San3Document(fixture()), {
      "city.0.population": 30_000,
      "city.0.gold": 50_000,
      "city.0.food": 3_000_000,
      "officer.1.soldiers": 17_000,
      "officer.1.loyalty": 0,
      "officer.1.training": 100,
    });
    const document = new San3Document(result.bytes);
    expect(document.city(0).population).toBe(3_000_000);
    expect(document.officer(1)).toMatchObject({ soldiers: 17_000, loyalty: 0, training: 100 });
  });

  it("rejects invalid batches, relationship edits and unsupported army transitions", () => {
    const bytes = fixture();
    const document = new San3Document(bytes);
    for (const [key, value] of [
      ["city.0.gold", 50_001],
      ["city.0.food", -1],
      ["city.0.population", 1.5],
      ["officer.1.soldiers", 17_001],
      ["officer.1.soldiers", 0],
      ["officer.1.loyalty", 101],
      ["officer.0.loyalty", 90],
      ["officer.600.morale", 10],
      ["city.46.gold", 10],
      ["city.00.gold", 10],
      ["city.0.faction", 1],
      ["officer.1.role", 1],
      ["city.0.gold", Number.NaN],
    ] as const)
      expect(() => editSan3(document, { "city.0.food": 100, [key]: value })).toThrow();
    expect(document.copy()).toEqual(bytes);
    new DataView(bytes.buffer).setUint16(san3Layout.officers.offset + 30 + 2, 0);
    const noArmy = new San3Document(bytes);
    expect(
      officerFields(noArmy, 1)
        .filter((field) => field.readonly)
        .map((field) => field.columnId),
    ).toEqual(["soldiers", "training", "morale"]);
    expect(() => editSan3(noArmy, { "officer.1.soldiers": 1000 })).toThrow();
    bytes[san3Layout.officers.offset + 30 + 0x0c] = 7;
    const inactiveFields = officerFields(new San3Document(bytes), 1);
    expect(inactiveFields.slice(0, 4).every((field) => field.readonly)).toBe(true);
    expect(inactiveFields.slice(4, 10).every((field) => !field.readonly)).toBe(true);
    expect(inactiveFields.slice(10).every((field) => field.readonly)).toBe(true);
  });

  it("edits historical and custom abilities without changing neighboring bytes", () => {
    const bytes = fixture();
    bytes[san3Layout.officers.offset + 30 + 0x0c] = 7;
    const document = new San3Document(bytes);
    const changes = Object.fromEntries(
      [1, 532].flatMap((index) =>
        san3Attributes.map((id, relative) => [`officer.${index}.${id}`, 91 + relative]),
      ),
    );
    const edited = editSan3(document, changes);
    const after = new San3Document(edited.bytes);
    const restored = edited.bytes.slice();
    for (const index of [1, 532]) {
      expect(Object.values(after.attributes(index))).toEqual([91, 92, 93, 94, 95, 96]);
      const offset = document.attributeOffset(index);
      restored.set(bytes.subarray(offset, offset + 6), offset);
      expect(after.officer(index).soldierLimit).toBe(19_200);
    }
    expect(restored).toEqual(bytes);
    expect(document.copy()).toEqual(bytes);
    for (const value of [0, 101, 1.5, Number.NaN])
      expect(() =>
        editSan3(document, { "officer.1.land": 100, "officer.532.strength": value }),
      ).toThrow();
  });

  it("uses final leadership for troop requests and never silently changes armies", () => {
    const document = new San3Document(fixture());
    for (const entries of [
      [
        ["officer.1.soldiers", 20_000],
        ["officer.1.land", 100],
      ],
      [
        ["officer.1.land", 100],
        ["officer.1.soldiers", 20_000],
      ],
    ]) {
      const edited = editSan3(document, Object.fromEntries(entries));
      expect(new San3Document(edited.bytes).officer(1).soldiers).toBe(20_000);
    }
    expect(() =>
      editSan3(document, {
        "officer.1.soldiers": 17_000,
        "officer.1.land": 1,
        "officer.1.naval": 1,
      }),
    ).toThrow();
    const largeArmy = editSan3(document, { "officer.1.soldiers": 17_000 }).bytes;
    const changed = editSan3(new San3Document(largeArmy), {
      "officer.1.land": 1,
      "officer.1.naval": 1,
    });
    expect(new San3Document(changed.bytes).officer(1)).toMatchObject({
      soldiers: 17_000,
      soldierLimit: 10_100,
    });
    expect(changed.edits.map(({ field }) => field.columnId)).toEqual(["land", "naval"]);
  });
});
