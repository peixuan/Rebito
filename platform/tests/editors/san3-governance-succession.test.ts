import { describe, expect, it } from "vitest";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { succeedSan3RulerAcrossCities } from "../../src/editors/san3/governance-succession.ts";
import {
  governanceCity as city,
  governanceOfficer as officer,
  san3GovernanceFixture,
} from "./san3-governance-fixture.ts";

describe("SAN3 cross-capital abdication", () => {
  it("moves the capital chain and repairs both governors without moving officers or armies", () => {
    const original = san3GovernanceFixture();
    original[officer(0) + 10] = 0x71;
    original[officer(4) + 10] = 0x74;
    const document = new San3Document(Buffer.from(original));
    const result = succeedSan3RulerAcrossCities(document, 0, 4);
    const data = new DataView(result.bytes.buffer);
    expect(result.change).toMatchObject({
      oldCapital: 0,
      newCapital: 1,
      previousRuler: 0,
      successor: 4,
      formerRulerRole: 3,
      governorRoleBefore: 4,
      governorRoleAfter: 3,
      advisorAfter: 65535,
    });
    expect(data.getUint16(san3Layout.factions.offset)).toBe(4);
    expect(data.getUint32(san3Layout.factions.offset + 2)).toBe(city(1));
    expect(data.getUint32(city(1))).toBe(city(0));
    expect(data.getUint32(city(0))).toBe(city(2));
    expect(data.getUint32(city(2))).toBe(0);
    expect(data.getUint16(city(0) + 4)).toBe(0);
    expect(data.getUint16(city(1) + 4)).toBe(4);
    expect(result.bytes[officer(0) + 15]).toBe(100);
    expect(result.bytes[officer(4) + 15]).toBe(0);
    expect(result.bytes[city(0) + 23]).toBe(0xa6);
    expect(result.bytes[city(1) + 23]).toBe(0xa4);
    const restored = result.bytes.slice();
    const view = new DataView(restored.buffer);
    for (const { offset, width, before } of result.writes) {
      if (width === 1) view.setUint8(offset, before);
      else if (width === 2) view.setUint16(offset, before);
      else view.setUint32(offset, before);
    }
    expect(restored).toEqual(original);
    expect(document.copy()).toEqual(original);
    for (const index of [0, 3, 4]) expect(data.getUint16(officer(index) + 2)).toBe(3000);
  });

  it("supports an existing governor and demotes an unarmed ruler to civil governor", () => {
    const bytes = san3GovernanceFixture();
    new DataView(bytes.buffer).setUint16(officer(0) + 2, 0);
    const result = succeedSan3RulerAcrossCities(new San3Document(bytes), 0, 8);
    expect(result.change).toMatchObject({
      oldGovernor: 8,
      successor: 8,
      formerRulerRole: 4,
      governorRoleAfter: 0,
    });
    expect(new DataView(result.bytes.buffer).getUint32(city(2))).toBe(city(0));
  });

  it("rejects foreign, same-capital, inactive and busy successors or malformed leadership", () => {
    const document = new San3Document(san3GovernanceFixture());
    for (const [faction, index] of [
      [0, 0],
      [0, 1],
      [0, 7],
      [0, 9],
      [2, 4],
      [21, 4],
      [0, 600],
    ])
      expect(() =>
        succeedSan3RulerAcrossCities(document, faction as number, index as number),
      ).toThrow();
    for (const index of [0, 3, 4]) {
      const bytes = document.copy();
      bytes[officer(index) + 9] = 8;
      expect(() => succeedSan3RulerAcrossCities(new San3Document(bytes), 0, 4)).toThrow();
    }
    const malformed = document.copy();
    new DataView(malformed.buffer).setUint32(san3Layout.factions.offset + 2, city(1));
    expect(() => succeedSan3RulerAcrossCities(new San3Document(malformed), 0, 4)).toThrow();
  });
});
