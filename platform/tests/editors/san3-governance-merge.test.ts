import { describe, expect, it } from "vitest";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { inspectSan3Governance } from "../../src/editors/san3/governance-core.ts";
import { mergeSan3Factions } from "../../src/editors/san3/governance-merge.ts";
import {
  governanceCity as city,
  governanceOfficer as officer,
  san3GovernanceFixture,
} from "./san3-governance-fixture.ts";

const faction = (index: number) => san3Layout.factions.offset + index * 50;
function fixture() {
  const bytes = san3GovernanceFixture();
  const data = new DataView(bytes.buffer);
  bytes[0x7878b] = 2;
  for (let index = 0; index < 21; index++) {
    for (const relative of [14, 36, 37, 42]) bytes[faction(index) + relative] = 255;
  }
  data.setUint32(0x7dc22, faction(0));
  data.setUint32(0x7dc2a, city(0));
  data.setUint32(0x7dbb2, faction(0));
  data.setUint32(0x7dbb6, faction(1));
  return bytes;
}

describe("SAN3 faction absorption", () => {
  it("absorbs the last city, preserves its armies and native turn identity, and cleans sponsors", () => {
    const original = fixture();
    const data = new DataView(original.buffer);
    original[0x7dc0b] = 1;
    data.setUint32(faction(0) + 6, 0x80000002);
    data.setUint32(faction(1) + 6, 0x40000003);
    original[faction(0) + 14] = 1;
    original[faction(0) + 36] = 1;
    original[officer(2) + 8] = 0x89;
    original[officer(2) + 9] = 0xb0;
    original[officer(2) + 10] = 0x75;
    original[officer(2) + 11] = 0xe9;
    original[officer(2) + 19] = 1;
    original[officer(2) + 20] = 12;
    const document = new San3Document(Buffer.from(original));
    const result = mergeSan3Factions(document, 1, 0);
    const changed = new San3Document(result.bytes);
    const graph = inspectSan3Governance(changed);
    expect(graph.factionCities).toMatchObject({ 0: [0, 1, 2, 3], 1: [] });
    expect(changed.faction(1).active).toBe(false);
    expect(changed.officer(6)).toMatchObject({ role: 3, faction: 0, soldiers: 3000, loyalty: 100 });
    expect(result.bytes[city(3) + 23]).toBe(0xa6);
    expect(result.bytes[0x7878b]).toBe(1);
    expect([...result.bytes.subarray(0x7dc0a, 0x7dc0c)]).toEqual([1, 0]);
    expect(changed.read(faction(0) + 6, 4)).toBe(0x80000000);
    expect(changed.read(faction(1) + 6, 4)).toBe(0x40000000);
    expect(result.bytes[faction(0) + 36]).toBe(255);
    expect(result.bytes[faction(0) + 14]).toBe(255);
    expect([...result.bytes.subarray(officer(2) + 8, officer(2) + 12)]).toEqual([
      0x81, 0x80, 0x75, 0xe0,
    ]);
    expect(result.change.cleanup).toEqual([
      { index: 2, rebellion: 1, turncoat: 3, infiltration: 9 },
    ]);
    expect(result.bytes.subarray(0x7dbb2, 0x7dc0a)).toEqual(original.subarray(0x7dbb2, 0x7dc0a));
    expect(result.bytes.subarray(0x7dc1f, 0x7dc2e)).toEqual(original.subarray(0x7dc1f, 0x7dc2e));
    const restored = result.bytes.slice();
    const restoredView = new DataView(restored.buffer);
    for (const { offset, width, before } of result.writes) {
      if (width === 1) restoredView.setUint8(offset, before);
      else if (width === 2) restoredView.setUint16(offset, before);
      else restoredView.setUint32(offset, before);
    }
    expect(restored).toEqual(original);
    result.bytes.fill(0);
    expect(document.copy()).toEqual(original);
  });

  it("absorbs multiple cities without moving their officers or selecting a different ruler", () => {
    const bytes = fixture();
    new DataView(bytes.buffer).setUint32(0x7dc22, faction(1));
    new DataView(bytes.buffer).setUint32(0x7dc2a, city(3));
    const result = mergeSan3Factions(new San3Document(bytes), 0, 1);
    const document = new San3Document(result.bytes);
    expect(inspectSan3Governance(document).factionCities[1]).toEqual([3, 0, 1, 2]);
    expect(document.faction(1).ruler).toBe(6);
    expect(result.change.allegiances).toHaveLength(7);
  });

  it("treats joint-attack targets as city IDs, not as faction IDs", () => {
    const bytes = fixture();
    bytes[faction(0) + 36] = 7;
    bytes[faction(0) + 37] = 1;
    const unrelated = mergeSan3Factions(new San3Document(bytes), 1, 0);
    expect(unrelated.bytes[faction(0) + 36]).toBe(7);
    bytes[faction(0) + 37] = 3;
    const absorbedTarget = mergeSan3Factions(new San3Document(bytes), 1, 0);
    expect(absorbedTarget.bytes[faction(0) + 36]).toBe(255);
    expect(absorbedTarget.bytes[faction(0) + 37]).toBe(3);
  });

  it("rejects live command dissolution, inconsistent counts, missions and malformed graphs", () => {
    const original = fixture();
    for (const [source, target] of [
      [0, 1],
      [1, 1],
      [2, 0],
      [1, 21],
      [-1, 0],
    ])
      expect(() =>
        mergeSan3Factions(new San3Document(original), source as number, target as number),
      ).toThrow();
    for (const [offset, value] of [
      [0x7878b, 0],
      [0x7dc0b, 2],
      [faction(1) + 42, 3],
      [officer(7) + 9, 64],
      [officer(6) + 8, 4],
      [city(3) + 22, 1],
    ]) {
      const bytes = original.slice();
      bytes[offset as number] = value as number;
      expect(() => mergeSan3Factions(new San3Document(bytes), 1, 0)).toThrow();
    }
    const spy = original.slice();
    spy[officer(2) + 9] = 64;
    spy[officer(2) + 26] = 7;
    spy[officer(2) + 28] = 3;
    expect(() => mergeSan3Factions(new San3Document(spy), 1, 0)).toThrow();
    const broken = original.slice();
    new DataView(broken.buffer).setUint16(officer(7), 6);
    expect(() => mergeSan3Factions(new San3Document(broken), 1, 0)).toThrow();
  });
});
