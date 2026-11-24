import { describe, expect, it } from "vitest";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { inspectSan3Governance } from "../../src/editors/san3/governance-core.ts";
import { setSan3OfficerPresence } from "../../src/editors/san3/governance-membership.ts";
import { withdrawSan3Officer } from "../../src/editors/san3/governance-withdrawal.ts";
import { san3TreasureLayout } from "../../src/editors/san3/treasures.ts";
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
  for (let index = 0; index < 532; index++)
    data.setUint16(san3Layout.historical.offset + index * 30, 1);
  data.setUint16(0x7dc4c, 57);
  data.setUint16(0x7dc4e, 11);
  bytes.set([0, 220, 0, 41, 22, 0, 0, 12], 0x7e01a);
  return bytes;
}

describe("SAN3 withdrawal before appearance", () => {
  it("detaches an advisor, retires the army and leaves emergence data unchanged", () => {
    const original = fixture();
    original[officer(2) + 8] = 0x81;
    const document = new San3Document(Buffer.from(original));
    const result = withdrawSan3Officer(document, 2);
    const changed = new San3Document(result.bytes);
    const graph = inspectSan3Governance(changed);
    expect(graph.membership.has(2)).toBe(false);
    expect(graph.cities[0]).toMatchObject({ serving: [0, 1], advisor: 65535 });
    expect(changed.officer(2)).toMatchObject({
      role: 7,
      city: 255,
      faction: 255,
      available: false,
      soldiers: 0,
      training: 0,
      morale: 0,
    });
    expect(result.change).toMatchObject({ soldiersRemoved: 3000, advisorRemoved: true });
    expect(changed.read(0x7dc4c, 2)).toBe(57);
    expect(changed.read(0x7dc4e, 2)).toBe(11);
    expect(result.bytes.subarray(0x7e01a, 0x7e022)).toEqual(original.subarray(0x7e01a, 0x7e022));
    const restored = result.bytes.slice();
    const restore = new DataView(restored.buffer);
    for (const { offset, width, before } of result.writes) {
      if (width === 1) restore.setUint8(offset, before);
      else if (width === 2) restore.setUint16(offset, before);
      else restore.setUint32(offset, before);
    }
    expect(restored).toEqual(original);
    result.bytes.fill(0);
    expect(document.copy()).toEqual(original);
  });

  it("withdraws free and hidden officers and supports explicit later introduction", () => {
    for (const index of [1, 2, 5, 9, 10]) {
      const removed = withdrawSan3Officer(new San3Document(fixture()), index);
      const document = new San3Document(removed.bytes);
      expect(inspectSan3Governance(document).membership.has(index)).toBe(false);
      expect(removed.change.soldiersRemoved).toBe(index < 9 ? 3000 : 0);
      const restored = setSan3OfficerPresence(document, index, 6, 4);
      expect(inspectSan3Governance(new San3Document(restored.bytes)).cities[4]?.hidden[0]).toBe(
        index,
      );
    }
  });

  it("requires leadership handover, settled status and belongings returned first", () => {
    const original = fixture();
    for (const index of [0, 3, 6, 8, 11, 599, 600])
      expect(() => withdrawSan3Officer(new San3Document(original), index)).toThrow();
    for (const [relative, value] of [
      [8, 16],
      [8, 4],
      [9, 8],
      [9, 64],
      [10, 1],
      [11, 8],
      [26, 7],
    ]) {
      const bytes = original.slice();
      bytes[officer(2) + (relative as number)] = value as number;
      expect(() => withdrawSan3Officer(new San3Document(bytes), 2)).toThrow();
    }
    const treasure = original.slice();
    const data = new DataView(treasure.buffer);
    data.setUint16(san3TreasureLayout.owners + 2, 2);
    data.setUint16(officer(2) + 4, 2);
    expect(() => withdrawSan3Officer(new San3Document(treasure), 2)).toThrow();
    const book = original.slice();
    const books = new DataView(book.buffer);
    books.setUint16(san3TreasureLayout.owners, 1);
    books.setUint16(officer(2) + 4, 0x2001);
    expect(() => withdrawSan3Officer(new San3Document(book), 2)).toThrow();
    const corrupt = original.slice();
    new DataView(corrupt.buffer).setUint16(city(0) + 4, 2);
    expect(() => withdrawSan3Officer(new San3Document(corrupt), 2)).toThrow();
  });
});
