import { describe, expect, it } from "vitest";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { relocateSan3Officers } from "../../src/editors/san3/relocation.ts";

const city = (index: number) => san3Layout.cities.offset + index * 0x34;
const officer = (index: number) => san3Layout.officers.offset + index * 30;

/** Original synthetic graph: two factions and a neutral city, with three list kinds. */
function fixture() {
  const bytes = new Uint8Array(san3Layout.size);
  const data = new DataView(bytes.buffer);
  data.setUint32(0x78000, 0x4b4f4549);
  data.setUint32(0x78776, 0x4b4f4549);
  data.setUint16(0x78788, 200);
  for (let index = 0; index < 21; index++)
    data.setUint16(san3Layout.factions.offset + index * 50, 0xffff);
  for (let index = 0; index < 46; index++) {
    for (const relative of [4, 6, 8, 10]) data.setUint16(city(index) + relative, 0xffff);
    bytes[city(index) + 20] = 0xff;
  }
  for (let index = 0; index < 600; index++) {
    data.setUint16(officer(index), 0xffff);
    bytes[officer(index) + 12] = 7;
    bytes[officer(index) + 16] = 0xff;
    bytes[officer(index) + 17] = 0xff;
  }
  for (const [index, ruler] of [
    [0, 0],
    [1, 4],
  ] as const) {
    data.setUint16(san3Layout.factions.offset + index * 50, ruler);
    data.setUint32(san3Layout.factions.offset + index * 50 + 2, city(index));
    bytes[city(index) + 20] = index;
  }
  const lists = [
    [0, 4, [0, 1, 2, 3], [0, 1, 2, 1]],
    [0, 6, [10], [5]],
    [0, 8, [11], [6]],
    [1, 4, [4, 5], [0, 4]],
    [2, 6, [12], [5]],
  ] as const;
  for (const [location, head, indices, roles] of lists) {
    data.setUint16(city(location) + head, indices[0]);
    for (const [position, index] of indices.entries()) {
      const base = officer(index);
      data.setUint16(base, indices[position + 1] ?? 0xffff);
      data.setUint16(base + 2, 1500);
      bytes[base + 8] = 0x81;
      bytes[base + 10] = 0x70;
      bytes[base + 12] = roles[position] ?? 7;
      bytes[base + 15] = 75;
      bytes[base + 16] = location;
      bytes[base + 17] = head === 4 ? location : 0xff;
      bytes[base + 21] = 77;
    }
  }
  data.setUint16(city(0) + 10, 1);
  bytes[123] = 219;
  return bytes;
}

describe("Japanese Mega-CD atomic officer relocation", () => {
  it("relinks a batch, replaces its advisor and previews every changed byte", () => {
    const original = fixture();
    const document = new San3Document(original);
    const result = relocateSan3Officers(document, [1, 2], 1);
    const data = new DataView(result.bytes.buffer);
    expect(data.getUint16(officer(0))).toBe(3);
    expect(data.getUint16(city(0) + 10)).toBe(3);
    expect(data.getUint16(officer(5))).toBe(1);
    expect(data.getUint16(officer(1))).toBe(2);
    expect(data.getUint16(officer(2))).toBe(0xffff);
    for (const index of [1, 2]) {
      expect(data.getUint16(officer(index) + 2)).toBe(0);
      expect(result.bytes[officer(index) + 8]).toBe(0x80);
      expect(result.bytes.slice(officer(index) + 15, officer(index) + 18)).toEqual(
        new Uint8Array([100, 1, 1]),
      );
      expect(result.bytes[officer(index) + 12]).toBe(4);
      expect(result.bytes[officer(index) + 21]).toBe(77);
    }
    expect(result.moves.map(({ soldiersRemoved }) => soldiersRemoved)).toEqual([1500, 1500]);
    const restored = result.bytes.slice();
    const restoredData = new DataView(restored.buffer);
    for (const { offset, width, before, after } of result.writes) {
      expect(document.read(offset, width)).toBe(before);
      expect(width === 1 ? data.getUint8(offset) : data.getUint16(offset)).toBe(after);
      if (width === 1) restoredData.setUint8(offset, before);
      else restoredData.setUint16(offset, before);
    }
    expect(restored).toEqual(original);
    expect(document.copy()).toEqual(original);
  });

  it("moves free and undiscovered officers into service or a neutral list", () => {
    const recruited = relocateSan3Officers(new San3Document(fixture()), [10, 11], 1);
    const data = new DataView(recruited.bytes.buffer);
    expect(data.getUint16(city(0) + 6)).toBe(0xffff);
    expect(data.getUint16(city(0) + 8)).toBe(0xffff);
    expect(data.getUint16(officer(5))).toBe(10);
    expect(data.getUint16(officer(10))).toBe(11);
    expect(recruited.moves.map(({ soldiersRemoved }) => soldiersRemoved)).toEqual([0, 0]);
    const released = relocateSan3Officers(new San3Document(fixture()), [2], 2);
    expect(new DataView(released.bytes.buffer).getUint16(officer(12))).toBe(2);
    expect(released.bytes[officer(2) + 12]).toBe(5);
    expect(released.bytes[officer(2) + 17]).toBe(0xff);
    expect(released.bytes[officer(2) + 15]).toBe(75);
  });

  it("clears the advisor reference when no advisor remains in the source city", () => {
    const result = relocateSan3Officers(new San3Document(fixture()), [1, 3], 1);
    const data = new DataView(result.bytes.buffer);
    expect(data.getUint16(city(0) + 10)).toBe(0xffff);
    expect(data.getUint16(officer(0))).toBe(2);
  });

  it("rejects unsafe states, ruler/governor changes and invalid batches without mutation", () => {
    const original = fixture();
    const document = new San3Document(original);
    for (const indices of [[], [2, 2], [2, 4], [0], [600], [-1], [1.5], [531]])
      expect(() => relocateSan3Officers(document, indices, 1)).toThrow();
    for (const destination of [0, 46, -1, 0.5, Number.NaN])
      expect(() => relocateSan3Officers(document, [2], destination)).toThrow();
    for (const [relative, value] of [
      [8, 4],
      [8, 8],
      [8, 16],
      [9, 64],
      [9, 8],
      [9, 16],
      [9, 1],
      [10, 1],
      [10, 4],
      [11, 8],
      [11, 1],
      [26, 3],
      [27, 1],
    ] as const) {
      const input = fixture();
      input[officer(2) + relative] = value;
      expect(() => relocateSan3Officers(new San3Document(input), [2], 1)).toThrow();
    }
    const governor = fixture();
    const data = new DataView(governor.buffer);
    data.setUint16(city(0) + 4, 2);
    data.setUint16(officer(2), 0);
    data.setUint16(officer(1), 3);
    expect(() => relocateSan3Officers(new San3Document(governor), [2], 1)).toThrow();
    expect(document.copy()).toEqual(original);
  });

  it("rejects cycles, shared membership and inconsistent references before any write", () => {
    const mutations: [number, number, 1 | 2 | 4][] = [
      [officer(2), 2, 2],
      [officer(2), 600, 2],
      [city(0) + 6, 2, 2],
      [city(0) + 10, 2, 2],
      [city(0) + 4, 0xffff, 2],
      [city(0), city(0), 4],
      [city(0), city(1), 4],
      [officer(2) + 16, 1, 1],
      [officer(2) + 17, 1, 1],
      [officer(2) + 12, 5, 1],
      [san3Layout.factions.offset, 10, 2],
    ];
    for (const [offset, value, width] of mutations) {
      const input = fixture();
      const data = new DataView(input.buffer);
      if (width === 1) data.setUint8(offset, value);
      else if (width === 2) data.setUint16(offset, value);
      else data.setUint32(offset, value);
      const original = input.slice();
      expect(() => relocateSan3Officers(new San3Document(input), [2], 1)).toThrow();
      expect(input).toEqual(original);
    }
  });
});
