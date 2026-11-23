import { describe, expect, it } from "vitest";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { replaceSan3Ruler } from "../../src/editors/san3/ruler-change.ts";

const city = (index: number) => san3Layout.cities.offset + index * 52;
const officer = (index: number) => san3Layout.officers.offset + index * 30;

/** Synthetic two-city faction with a ruler, two advisors and a general. */
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
    bytes[city(index) + 20] = index < 2 ? 0 : 0xff;
  }
  data.setUint32(city(0), city(1));
  data.setUint16(city(0) + 4, 0);
  data.setUint16(city(0) + 10, 1);
  data.setUint16(city(1) + 4, 4);
  for (let index = 0; index < 600; index++) {
    const base = officer(index);
    data.setUint16(base, index < 3 ? index + 1 : 0xffff);
    if (index < 5) data.setUint16(base + 2, 1500);
    bytes[base + 8] = 0x80;
    bytes[base + 10] = 0x70;
    bytes[base + 12] = [0, 1, 2, 1, 3][index] ?? 7;
    bytes[base + 15] = index === 0 ? 0 : 75;
    bytes[base + 16] = index < 4 ? 0 : index === 4 ? 1 : 0xff;
    bytes[base + 17] = index < 5 ? 0 : 0xff;
  }
  bytes[123] = 219;
  return bytes;
}

describe("Japanese Mega-CD same-capital ruler replacement", () => {
  it("offers eligible successors and keeps relationship effects out of writable changes", () => {
    const bytes = fixture();
    const initial = san3Adapter.view(bytes, { module: "factions", record: "0" });
    const field = initial.fields.find(({ columnId }) => columnId === "replaceRuler");
    expect(field?.choices?.map(({ value }) => value)).toEqual([0, 1, 2, 3]);
    expect(field?.readonly).toBe(false);
    const view = san3Adapter.view(bytes, { changes: { "ruler.0.officer": 1 } });
    expect(view.changes).toEqual({ "ruler.0.officer": 1 });
    expect(view.preview).toContainEqual(
      expect.objectContaining({ key: "ruler.0.0.loyalty", before: 0, after: 100 }),
    );
    expect(
      new San3Document(san3Adapter.apply(bytes, { changes: view.changes })).faction(0).ruler,
    ).toBe(1);
    for (const changes of [
      { "ruler.0.officer": 1, "officer.1.loyalty": 10 },
      { "ruler.0.officer": 600 },
      { "ruler.21.officer": 1 },
    ])
      expect(() => san3Adapter.apply(bytes, { changes })).toThrow();
    expect(() => san3Adapter.apply(bytes, { changes: { "ruler.0.officer": 0 } })).toThrow(
      "editor.noChanges",
    );
  });

  it("repairs leadership and advisor links while retaining both armies and the capital", () => {
    const original = fixture();
    const document = new San3Document(original);
    const result = replaceSan3Ruler(document, 0, 1);
    const data = new DataView(result.bytes.buffer);
    expect(result.change).toEqual({
      faction: 0,
      capital: 0,
      previousRuler: 0,
      successor: 1,
      formerRulerRole: 3,
      formerRulerLoyalty: 100,
    });
    expect(data.getUint16(san3Layout.factions.offset)).toBe(1);
    expect(data.getUint32(san3Layout.factions.offset + 2)).toBe(city(0));
    expect(data.getUint16(city(0) + 4)).toBe(1);
    expect(data.getUint16(city(0) + 10)).toBe(3);
    expect(data.getUint16(officer(1))).toBe(0);
    expect(data.getUint16(officer(0))).toBe(2);
    for (const index of [0, 1]) expect(data.getUint16(officer(index) + 2)).toBe(1500);
    expect(result.bytes[officer(0) + 12]).toBe(3);
    expect(result.bytes[officer(0) + 15]).toBe(100);
    expect(result.bytes[officer(1) + 12]).toBe(0);
    expect(result.bytes[officer(1) + 15]).toBe(0);
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

  it("demotes an unarmed ruler to civil service and clears or preserves the advisor", () => {
    for (const successor of [1, 2]) {
      const bytes = fixture();
      new DataView(bytes.buffer).setUint16(officer(0) + 2, 0);
      bytes[officer(3) + 12] = 4;
      const result = replaceSan3Ruler(new San3Document(bytes), 0, successor);
      expect(result.bytes[officer(0) + 12]).toBe(4);
      expect(new DataView(result.bytes.buffer).getUint16(city(0) + 10)).toBe(
        successor === 1 ? 0xffff : 1,
      );
    }
  });

  it("rejects other capitals, inactive factions and malformed leadership lists", () => {
    const document = new San3Document(fixture());
    for (const successor of [0, 4, 10, -1, 600, 0.5, Number.NaN])
      expect(() => replaceSan3Ruler(document, 0, successor)).toThrow();
    for (const faction of [1, 21, -1, 0.5, Number.NaN])
      expect(() => replaceSan3Ruler(document, faction, 1)).toThrow();
    const bytes = fixture();
    new DataView(bytes.buffer).setUint16(officer(2), 2);
    expect(() => replaceSan3Ruler(new San3Document(bytes), 0, 1)).toThrow();
    const delegated = fixture();
    delegated[city(0) + 0x17] = 1;
    expect(() => replaceSan3Ruler(new San3Document(delegated), 0, 1)).toThrow();
  });

  it("requires both officers to be idle and unequipped without changing rejected memory", () => {
    for (const index of [0, 1]) {
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
        const original = fixture();
        original[officer(index) + relative] = value;
        const document = new San3Document(original);
        expect(() => replaceSan3Ruler(document, 0, 1)).toThrow();
        expect(document.copy()).toEqual(original);
      }
    }
  });
});
