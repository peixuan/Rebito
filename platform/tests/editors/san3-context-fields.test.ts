import { describe, expect, it } from "vitest";
import {
  factionContextFields,
  historicalContextFields,
} from "../../src/editors/san3/context-fields.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { editSan3 } from "../../src/editors/san3/fields.ts";

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
  const historical = san3Layout.historical.offset + 531 * san3Layout.historical.stride;
  data.setUint16(historical, 307);
  bytes.set([0xa3, 0xb4, 0xf7, 61, 62, 63, 64, 65, 66, 149, 99, 255, 243], historical + 2);
  const faction = san3Layout.factions.offset;
  data.setUint32(faction + 6, 0xe0100102);
  for (let index = 0; index < 21; index++) bytes[faction + 15 + index] = 10 + index;
  bytes.set([20, 19, 0xee, 3], faction + 36);
  data.setUint16(faction + 40, 4321);
  bytes[faction + 42] = 45;
  data.setUint16(faction + 44, 54321);
  data.setUint32(faction + 46, 0xf1234567);
  return bytes;
}

describe("SAN3 read-only historical and faction context", () => {
  it("decodes historical definitions independently of current officers", () => {
    const fields = historicalContextFields(new San3Document(fixture()), 531);
    expect(fields).toHaveLength(16);
    expect(Object.fromEntries(fields.map((field) => [field.columnId, field.value]))).toEqual({
      portrait: 307,
      birthYear: 243,
      lineage: 255,
      lifespan: 7,
      compatibility: 149,
      morality: 99,
      ambition: 10,
      luck: 3,
      composure: 11,
      bravery: 4,
      land: 61,
      naval: 62,
      strength: 63,
      intelligence: 64,
      politics: 65,
      charisma: 66,
    });
    expect(fields.every((field) => field.readonly && !("offset" in field))).toBe(true);
    for (const index of [-1, 532, 0.5, Number.NaN])
      expect(() => historicalContextFields(new San3Document(fixture()), index)).toThrow();
  });

  it("uses native big-endian alliance bit order and all21 hostility entries", () => {
    const fields = factionContextFields(new San3Document(fixture()), 0);
    expect(fields).toHaveLength(49);
    const alliances = fields.filter((field) => field.columnId.startsWith("alliance."));
    expect(alliances.filter((field) => field.value).map((field) => field.columnId)).toEqual([
      "alliance.1",
      "alliance.8",
      "alliance.20",
    ]);
    expect(
      fields.filter((field) => field.columnId.startsWith("hostility.")).map((field) => field.value),
    ).toEqual(Array.from({ length: 21 }, (_, index) => index + 10));
    expect(
      Object.fromEntries(fields.slice(0, 7).map((field) => [field.columnId, field.value])),
    ).toEqual({
      jointFaction: 20,
      jointTarget: 19,
      jointRewardType: 3,
      jointRewardAmount: 4321,
      nomadicCity: 45,
      nomadicGold: 54321,
      nomadicFood: 0xf1234567,
    });
    expect(fields.every((field) => field.readonly && !("offset" in field))).toBe(true);
    expect(new Set(fields.map((field) => field.key)).size).toBe(49);
  });

  it("cannot publish context edits or expose addresses and opaque state", () => {
    const original = fixture();
    const document = new San3Document(original);
    for (const field of [
      ...historicalContextFields(document, 531),
      ...factionContextFields(document, 0),
    ]) {
      expect(() => editSan3(document, { [field.key]: 0 })).toThrow();
      expect(field).not.toHaveProperty("mask");
      expect(field).not.toHaveProperty("shift");
    }
    expect(document.copy()).toEqual(original);
    expect(() => factionContextFields(document, 21)).toThrow();
  });
});
