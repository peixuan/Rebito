import { describe, expect, it } from "vitest";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { editSan3, officerFields } from "../../src/editors/san3/fields.ts";
import { inspectSan3Governance } from "../../src/editors/san3/governance-core.ts";
import { removeSan3Officer, reviveSan3Officer } from "../../src/editors/san3/governance-life.ts";
import { inspectSan3Treasures, san3TreasureLayout } from "../../src/editors/san3/treasures.ts";
import {
  governanceCity as city,
  governanceOfficer as officer,
  san3GovernanceFixture,
} from "./san3-governance-fixture.ts";

function fixture() {
  const bytes = san3GovernanceFixture();
  const data = new DataView(bytes.buffer);
  for (let index = 1; index < 13; index++)
    data.setUint16(san3TreasureLayout.owners + index * 2, 65535);
  for (let index = 0; index < 532; index++) {
    data.setUint16(san3Layout.historical.offset + index * 30, 1);
    bytes.fill(
      60,
      san3Layout.historical.offset + index * 30 + 5,
      san3Layout.historical.offset + index * 30 + 11,
    );
  }
  return bytes;
}

describe("SAN3 coherent death and revival", () => {
  it("detaches the advisor and transfers unique items and book copies to the surviving ruler", () => {
    const original = fixture();
    const data = new DataView(original.buffer);
    data.setUint16(san3TreasureLayout.owners, 3);
    data.setUint16(san3TreasureLayout.owners + 2, 2);
    data.setUint16(san3TreasureLayout.owners + 4, 0);
    data.setUint16(officer(0) + 4, 0x2005);
    data.setUint16(officer(2) + 4, 0x4003);
    const document = new San3Document(Buffer.from(original));
    const result = removeSan3Officer(document, 2);
    const changed = new San3Document(result.bytes);
    expect(changed.officer(2).available).toBe(false);
    for (const id of ["soldiers", "loyalty", "training", "morale"])
      expect(officerFields(changed, 2).find((field) => field.columnId === id)?.readonly).toBe(true);
    expect(() => editSan3(changed, { "officer.2.soldiers": 1000 })).toThrow();
    expect(() => editSan3(changed, { "officer.2.land": 61 })).toThrow();
    expect(changed.attributes(2)).toEqual(document.attributes(2));
    expect(inspectSan3Governance(changed).cities[0]).toMatchObject({
      serving: [0, 1],
      advisor: 65535,
    });
    expect(result.change).toEqual({
      index: 2,
      city: 0,
      recipient: 0,
      items: [1],
      copies: 2,
      soldiersRemoved: 3000,
      advisorRemoved: true,
    });
    expect(inspectSan3Treasures(changed)).toMatchObject({
      total: 3,
      copies: Array.from({ length: 600 }, (_, index) => (index === 0 ? 3 : 0)),
    });
    expect(changed.read(officer(0) + 4, 2)).toBe(0x6007);
    expect(result.bytes[officer(2) + 8]).toBe(0x90);
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

  it("returns unaffiliated belongings to the pool without disturbing hidden residents", () => {
    const bytes = fixture();
    const data = new DataView(bytes.buffer);
    data.setUint16(san3TreasureLayout.owners, 2);
    data.setUint16(san3TreasureLayout.owners + 6, 9);
    data.setUint16(officer(9) + 4, 0x4009);
    const result = removeSan3Officer(new San3Document(bytes), 9);
    const changed = new San3Document(result.bytes);
    expect(inspectSan3Governance(changed).cities[4]).toMatchObject({ free: [], hidden: [10] });
    expect(result.change).toMatchObject({
      recipient: 65535,
      copies: 2,
      items: [3],
      soldiersRemoved: 0,
    });
    expect(inspectSan3Treasures(changed).total).toBe(0);
    expect(changed.read(san3TreasureLayout.owners + 6, 2)).toBe(65535);
  });

  it("revives an actual deceased officer into a chosen free list without restoring an obsolete army", () => {
    const original = fixture();
    const removed = removeSan3Officer(new San3Document(original), 2);
    removed.bytes[officer(2) + 9] = 0xff;
    removed.bytes[officer(2) + 10] = 0x7f;
    removed.bytes[officer(2) + 11] = 0xff;
    removed.bytes[officer(2) + 26] = 7;
    removed.bytes[officer(2) + 27] = 0x13;
    const result = reviveSan3Officer(new San3Document(removed.bytes), 2, 4);
    const changed = new San3Document(result.bytes);
    expect(inspectSan3Governance(changed).cities[4]).toMatchObject({ free: [2, 9], hidden: [10] });
    expect(changed.officer(2)).toMatchObject({
      role: 5,
      city: 4,
      faction: 255,
      soldiers: 0,
      training: 0,
      morale: 0,
    });
    expect([...result.bytes.subarray(officer(2) + 8, officer(2) + 12)]).toEqual([
      0x80, 0x80, 0x70, 0xe0,
    ]);
    expect(changed.attributes(2)).toEqual(new San3Document(original).attributes(2));
    expect(result.bytes.subarray(officer(2) + 26, officer(2) + 30)).toEqual(new Uint8Array(4));
  });

  it("requires explicit succession, valid definitions and consistent inventories", () => {
    const original = fixture();
    for (const index of [0, 3, 6, 8, 599, 600])
      expect(() => removeSan3Officer(new San3Document(original), index)).toThrow();
    for (const relative of [8, 9, 11, 26, 27]) {
      const bytes = original.slice();
      bytes[officer(2) + relative] = relative === 8 ? 4 : relative === 11 ? 8 : 1;
      expect(() => removeSan3Officer(new San3Document(bytes), 2)).toThrow();
    }
    expect(() => reviveSan3Officer(new San3Document(original), 599, 4)).toThrow();
    const unused = original.slice();
    unused[officer(599) + 8] = 16;
    new DataView(unused.buffer).setUint16(san3Layout.custom.offset + 67 * 28, 65535);
    expect(() => reviveSan3Officer(new San3Document(unused), 599, 4)).toThrow();
    const broken = original.slice();
    new DataView(broken.buffer).setUint16(san3TreasureLayout.owners + 2, 2);
    expect(() => removeSan3Officer(new San3Document(broken), 2)).toThrow();
    expect(new San3Document(original).read(city(0) + 4, 2)).toBe(0);
  });
});
