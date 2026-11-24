import { describe, expect, it } from "vitest";
import { san3Layout } from "../../src/editors/san3/document.ts";
import { exchangeSan3Equipment } from "../../src/editors/san3/equipment.ts";
import { san3BattleFixture } from "./san3-battle-fixture.ts";

const city = san3Layout.cities.offset;
const officer = san3Layout.officers.offset;

function fixture() {
  const bytes = san3BattleFixture();
  const data = new DataView(bytes.buffer);
  bytes[officer + 10] = 0x70;
  bytes[city + 21] = 0x80;
  for (const relative of [36, 38, 40]) data.setUint16(city + relative, 100);
  for (const relative of [43, 44, 45]) bytes[city + relative] = 10;
  return bytes;
}

describe("SAN3 deployed equipment exchanges", () => {
  it("reserves weapons by whole hundreds, preserves lifespan and previews every write", () => {
    const original = fixture();
    const result = exchangeSan3Equipment(original, [
      { index: 0, soldiers: 2099, weapon: 1, ship: 0 },
    ]);
    const data = new DataView(result.bytes.buffer);
    expect(data.getUint16(city + 40)).toBe(80);
    expect(result.bytes[officer + 10]).toBe(0x71);
    const resized = exchangeSan3Equipment(result.bytes, [
      { index: 0, soldiers: 2100, weapon: 1, ship: 0 },
    ]);
    expect(new DataView(resized.bytes.buffer).getUint16(city + 40)).toBe(79);
    const changed = exchangeSan3Equipment(resized.bytes, [
      { index: 0, soldiers: 2100, weapon: 2, ship: 0 },
    ]);
    expect(new DataView(changed.bytes.buffer).getUint16(city + 40)).toBe(100);
    expect(new DataView(changed.bytes.buffer).getUint16(city + 36)).toBe(79);
    const restored = result.bytes.slice();
    const restoredData = new DataView(restored.buffer);
    for (const { offset, width, before } of result.writes) {
      if (width === 1) restoredData.setUint8(offset, before);
      else restoredData.setUint16(offset, before);
    }
    expect(restored).toEqual(original);
    expect(original).toEqual(fixture());
  });

  it("exchanges one vessel at a port without charging it again on troop changes", () => {
    const bytes = fixture();
    bytes[officer + 10] = 0x74;
    const result = exchangeSan3Equipment(bytes, [{ index: 0, soldiers: 3000, weapon: 0, ship: 2 }]);
    expect([...result.bytes.slice(city + 43, city + 46)]).toEqual([11, 9, 10]);
    expect(result.bytes[officer + 10]).toBe(0x78);
    expect(
      exchangeSan3Equipment(result.bytes, [{ index: 0, soldiers: 3001, weapon: 0, ship: 2 }])
        .writes,
    ).toHaveLength(1);
  });

  it("settles a batch jointly so exchanging depleted stocks is order independent", () => {
    const bytes = fixture();
    const data = new DataView(bytes.buffer);
    data.setUint16(city + 36, 0);
    data.setUint16(city + 40, 0);
    bytes[officer + 10] = 0x71;
    bytes[officer + 30 + 10] = 0x72;
    bytes[officer + 30 + 16] = 0;
    bytes[officer + 30 + 17] = 0;
    const assignments = [
      { index: 0, soldiers: 2000, weapon: 2, ship: 0 },
      { index: 1, soldiers: 2000, weapon: 1, ship: 0 },
    ];
    const result = exchangeSan3Equipment(bytes, assignments);
    expect(exchangeSan3Equipment(bytes, [...assignments].reverse()).bytes).toEqual(result.bytes);
    expect(new DataView(result.bytes.buffer).getUint16(city + 36)).toBe(0);
    expect(new DataView(result.bytes.buffer).getUint16(city + 40)).toBe(0);
  });

  it("rejects stock loss, shortages, non-port exchanges and malformed input atomically", () => {
    const original = fixture();
    const target = { index: 0, soldiers: 2000, weapon: 1, ship: 0 };
    for (const changes of [
      { index: -1 },
      { index: 600 },
      { soldiers: 0 },
      { soldiers: 20_001 },
      { soldiers: 1.5 },
      { weapon: 4 },
      { ship: -1 },
    ])
      expect(() => exchangeSan3Equipment(original, [{ ...target, ...changes }])).toThrow();
    expect(() => exchangeSan3Equipment(original, [target, target])).toThrow();
    for (const mutate of [
      (bytes: Uint8Array) => new DataView(bytes.buffer).setUint16(city + 40, 19),
      (bytes: Uint8Array) => {
        bytes[officer + 17] = 1;
      },
      (bytes: Uint8Array) => {
        bytes[officer + 8] = 0;
      },
    ]) {
      const bytes = original.slice();
      mutate(bytes);
      expect(() => exchangeSan3Equipment(bytes, [target])).toThrow();
    }
    const nonPort = original.slice();
    nonPort[city + 21] = 0;
    expect(() => exchangeSan3Equipment(nonPort, [{ ...target, ship: 1 }])).toThrow();
    const overflow = original.slice();
    overflow[officer + 10] = 0x74;
    overflow[city + 43] = 100;
    expect(() => exchangeSan3Equipment(overflow, [target])).toThrow();
    expect(original).toEqual(fixture());
  });
});
