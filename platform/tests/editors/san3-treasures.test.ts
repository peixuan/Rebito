import { describe, expect, it } from "vitest";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import {
  editSan3Treasures,
  inspectSan3Treasures,
  san3TreasureLayout,
  san3TreasureRecipients,
} from "../../src/editors/san3/treasures.ts";

const officer = (index: number) => san3Layout.officers.offset + index * 30;
const city = (index: number) => san3Layout.cities.offset + index * 52;
const owner = (index: number) => san3TreasureLayout.owners + index * 2;

/** Original synthetic structure; no names or item tables extracted from a game. */
function fixture() {
  const bytes = new Uint8Array(san3Layout.size);
  const data = new DataView(bytes.buffer);
  data.setUint32(0x78000, 0x4b4f4549);
  data.setUint32(0x78776, 0x4b4f4549);
  data.setUint16(0x78788, 200);
  for (let index = 0; index < 21; index++)
    data.setUint16(san3Layout.factions.offset + index * 50, 0xffff);
  data.setUint16(san3Layout.factions.offset, 0);
  data.setUint32(san3Layout.factions.offset + 2, city(0));
  for (let index = 0; index < 46; index++) {
    for (const relative of [4, 6, 8, 10]) data.setUint16(city(index) + relative, 0xffff);
    bytes[city(index) + 20] = index === 0 ? 0 : 0xff;
  }
  data.setUint16(city(0) + 4, 0);
  for (let index = 0; index < 600; index++) {
    data.setUint16(officer(index), index < 2 ? index + 1 : 0xffff);
    bytes[officer(index) + 12] = index === 0 ? 0 : index < 3 ? 3 : 7;
    bytes[officer(index) + 16] = index < 3 ? 0 : 0xff;
    bytes[officer(index) + 17] = index < 3 ? 0 : 0xff;
  }
  for (let index = 1; index < 13; index++) data.setUint16(owner(index), 0xffff);
  data.setUint16(owner(1), 1);
  data.setUint16(officer(1) + 4, 2);
  bytes[123] = 219;
  return bytes;
}

describe("SAN3 coherent treasure ownership", () => {
  it("transfers unique ownership without changing abilities, other items or unrelated bytes", () => {
    const original = fixture();
    const document = new San3Document(original);
    expect(san3TreasureRecipients(document)).toEqual([0, 1, 2]);
    const result = editSan3Treasures(document, { "treasure.1.owner": 2 });
    const next = inspectSan3Treasures(new San3Document(result.bytes));
    expect(next.items[1]?.owner).toBe(2);
    expect(next.masks[1]).toBe(0);
    expect(next.masks[2]).toBe(2);
    const restored = result.bytes.slice();
    const data = new DataView(restored.buffer);
    for (const write of result.writes) {
      expect(document.read(write.offset, write.width)).toBe(write.before);
      if (write.width === 1) data.setUint8(write.offset, write.before);
      else data.setUint16(write.offset, write.before);
    }
    expect(restored).toEqual(original);
    expect(document.copy()).toEqual(original);
    expect(result.writes).toHaveLength(3);
    expect(editSan3Treasures(document, { "treasure.1.owner": 1 }).writes).toEqual([]);
  });

  it("preserves event custodians and handles removal and the seal discovery marker", () => {
    const bytes = fixture();
    const data = new DataView(bytes.buffer);
    data.setUint16(owner(2), 601);
    data.setUint16(owner(11), 600);
    bytes[city(4) + 0x17] = 0xc2;
    const result = editSan3Treasures(new San3Document(bytes), {
      "treasure.1.owner": 0xffff,
      "treasure.12.owner": 2,
    });
    const next = inspectSan3Treasures(new San3Document(result.bytes));
    expect(next.masks[0]).toBe(0);
    expect(next.masks[1]).toBe(0);
    expect(next.masks[2]).toBe(4096);
    expect(next.items[1]?.owner).toBe(0xffff);
    expect(result.bytes[city(4) + 0x17]).toBe(0x82);
    for (const index of [2, 11]) {
      expect(next.items[index]?.readonly).toBe(true);
      expect(() =>
        editSan3Treasures(new San3Document(bytes), { [`treasure.${index}.owner`]: 0 }),
      ).toThrow();
    }
  });

  it("validates final book totals and preserves unique items during redistribution", () => {
    let document = new San3Document(fixture());
    document = new San3Document(editSan3Treasures(document, { "book.1.copies": 7 }).bytes);
    const original = document.copy();
    expect(() => editSan3Treasures(document, { "book.2.copies": 1 })).toThrow();
    const result = editSan3Treasures(document, { "book.2.copies": 7, "book.1.copies": 0 });
    const next = inspectSan3Treasures(new San3Document(result.bytes));
    expect(next.total).toBe(7);
    expect(next.masks[1]).toBe(2);
    expect(next.masks[2]).toBe(0xe001);
    expect(document.copy()).toEqual(original);
    expect(editSan3Treasures(document, { "book.1.copies": 7 }).writes).toEqual([]);
  });

  it("rejects inconsistent ownership, quantities, discovery markers and malformed drafts", () => {
    for (const mutate of [
      (data: DataView) => data.setUint16(officer(2) + 4, 2),
      (data: DataView) => data.setUint16(owner(1), 2),
      (data: DataView) => data.setUint16(owner(2), 602),
      (data: DataView) => data.setUint16(owner(0), 1),
      (data: DataView) => data.setUint16(officer(2) + 4, 1),
      (data: DataView) => {
        data.setUint16(owner(0), 1);
        data.setUint16(officer(2) + 4, 0x2000);
      },
      (data: DataView) => {
        data.setUint8(city(1) + 0x17, 64);
        data.setUint8(city(2) + 0x17, 64);
      },
    ]) {
      const bytes = fixture();
      mutate(new DataView(bytes.buffer));
      expect(() => editSan3Treasures(new San3Document(bytes), { "treasure.1.owner": 2 })).toThrow();
    }
    const document = new San3Document(fixture());
    for (const changes of [
      { "treasure.0.owner": 1 },
      { "treasure.13.owner": 1 },
      { "treasure.1.owner": 600 },
      { "treasure.1.owner": -1 },
      { "treasure.1.owner": Number.NaN },
      { "book.600.copies": 1 },
      { "book.1.copies": 8 },
      { "book.1.copies": -1 },
      { "book.01.copies": 1 },
      { "officer.1.treasures": 65535 },
    ])
      expect(() => editSan3Treasures(document, changes)).toThrow();
  });

  it("rejects unsafe owners and malformed lists before any partial transfer", () => {
    for (const [relative, value] of [
      [8, 4],
      [8, 16],
      [9, 64],
      [9, 8],
      [11, 8],
      [26, 2],
      [27, 1],
    ] as const) {
      const bytes = fixture();
      bytes[officer(2) + relative] = value;
      const document = new San3Document(bytes);
      expect(() =>
        editSan3Treasures(document, { "book.1.copies": 1, "treasure.1.owner": 2 }),
      ).toThrow();
      expect(document.copy()).toEqual(bytes);
    }
    const bytes = fixture();
    new DataView(bytes.buffer).setUint16(officer(2), 2);
    expect(() => editSan3Treasures(new San3Document(bytes), { "treasure.1.owner": 2 })).toThrow();
  });
});
