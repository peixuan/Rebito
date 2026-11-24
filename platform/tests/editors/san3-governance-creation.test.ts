import { describe, expect, it, vi } from "vitest";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { inspectSan3Governance } from "../../src/editors/san3/governance-core.ts";
import {
  createSan3Faction,
  san3FactionFounders,
} from "../../src/editors/san3/governance-creation.ts";
import {
  governanceCity,
  governanceOfficer,
  san3GovernanceFixture,
} from "./san3-governance-fixture.ts";

function fixture() {
  const bytes = Buffer.from(san3GovernanceFixture());
  bytes[0x7878b] = 2;
  bytes[0x7878e] = 23;
  bytes.writeUInt32BE(san3Layout.factions.offset, 0x7dbb2);
  bytes.writeUInt32BE(san3Layout.factions.offset + 100, 0x7dbb6);
  bytes.writeUInt32BE(san3Layout.factions.offset + 50, 0x7dbba);
  bytes.writeUInt32BE(san3Layout.factions.offset, 0x7dc22);
  bytes.writeUInt32BE(governanceCity(0), 0x7dc2a);
  return bytes;
}

describe("SAN3 faction creation", () => {
  it("shares eligibility with the transaction without building speculative edited documents", () => {
    const bytes = fixture();
    const document = new San3Document(bytes);
    const copies = vi.spyOn(document, "copy");
    expect(san3FactionFounders(document, 2)).toEqual([3, 4, 5, 8, 9, 10]);
    expect(copies).not.toHaveBeenCalled();
    copies.mockRestore();
    bytes[governanceOfficer(4) + 9] = 8;
    bytes[governanceOfficer(9) + 9] = 8;
    expect(san3FactionFounders(new San3Document(bytes), 2)).toEqual([8, 10]);
    expect(() => san3FactionFounders(document, 0)).toThrow();
  });

  it("requires a registered custom definition before promoting a custom resident", () => {
    const bytes = fixture();
    bytes.copy(bytes, governanceOfficer(532), governanceOfficer(9), governanceOfficer(9) + 30);
    bytes.writeUInt16BE(532, governanceCity(4) + 6);
    bytes.writeUInt16BE(65535, san3Layout.custom.offset);
    const request = { faction: 2, city: 4, ruler: 532, human: 1 };
    expect(san3FactionFounders(new San3Document(bytes), 2)).not.toContain(532);
    expect(() => createSan3Faction(new San3Document(bytes), request)).toThrow();
    bytes.writeUInt16BE(0, san3Layout.custom.offset);
    expect(san3FactionFounders(new San3Document(bytes), 2)).toContain(532);
    expect(
      new San3Document(createSan3Faction(new San3Document(bytes), request).bytes).faction(2).ruler,
    ).toBe(532);
  });
  it("splits a noncapital city with loyal followers while preserving armies, icons and the queue", () => {
    const bytes = fixture();
    const other = san3Layout.factions.offset + 50;
    const created = san3Layout.factions.offset + 100;
    bytes.writeUInt32BE(0x80000004, other + 6);
    bytes[other + 36] = 2;
    bytes[other + 14] = 2;
    bytes[governanceOfficer(3) + 10] = 0xe3;
    const original = Buffer.from(bytes);
    const document = new San3Document(bytes);
    const result = createSan3Faction(document, { faction: 2, city: 1, ruler: 4, human: 1 });
    const after = new San3Document(result.bytes);
    const graph = inspectSan3Governance(after);
    expect(graph.factionCities.slice(0, 3)).toEqual([[0, 2], [3], [1]]);
    expect(graph.cities[1]?.serving).toEqual([4, 3, 5]);
    expect(graph.cities[1]?.advisor).toBe(65535);
    expect(after.faction(2)).toMatchObject({ active: true, ruler: 4 });
    expect(after.read(governanceOfficer(3) + 10, 1)).toBe(0xe3);
    for (const id of [3, 4, 5]) {
      expect(after.read(governanceOfficer(id) + 2, 2)).toBe(3000);
      expect(after.read(governanceOfficer(id) + 15, 1)).toBe(100);
      expect(after.read(governanceOfficer(id) + 17, 1)).toBe(2);
    }
    expect(after.read(other + 6, 4)).toBe(0x80000000);
    expect(after.read(other + 36, 1)).toBe(255);
    expect(after.read(other + 14, 1)).toBe(255);
    expect(after.read(san3Layout.factions.offset + 17, 1)).toBe(100);
    expect(after.read(created + 15, 1)).toBe(30);
    expect(after.read(0x7878b, 1)).toBe(3);
    expect(after.read(0x7dc0c, 1)).toBe(1);
    expect(after.read(0x7878e, 1)).toBe(23);
    expect(result.change).toMatchObject({ previousFaction: 0, upcomingPosition: 2 });
    expect(result.bytes.slice(0x7dbb2, 0x7dc0a)).toEqual(
      new Uint8Array(original.slice(0x7dbb2, 0x7dc0a)),
    );
    const restored = result.bytes.slice();
    const data = new DataView(restored.buffer);
    for (const { offset, width, before } of result.writes) {
      if (width === 1) data.setUint8(offset, before);
      else if (width === 2) data.setUint16(offset, before);
      else data.setUint32(offset, before);
    }
    expect(restored).toEqual(new Uint8Array(original));
    expect(bytes).toEqual(original);
    expect(document.copy()).toEqual(new Uint8Array(original));
  });

  it.each([9, 10])(
    "founds in neutral territory from resident %i without reviving retired troops",
    (ruler) => {
      const bytes = fixture();
      bytes.writeUInt32BE(san3Layout.factions.offset + 50, 0x7dbb6);
      bytes.writeUInt32BE(0, 0x7dbba);
      bytes.writeUInt16BE(2222, governanceOfficer(ruler) + 2);
      bytes[governanceOfficer(ruler) + 10] = 0xe3;
      const result = createSan3Faction(new San3Document(bytes), {
        faction: 2,
        city: 4,
        ruler,
        human: 0,
      });
      const after = new San3Document(result.bytes);
      const graph = inspectSan3Governance(after);
      expect(graph.cities[4]).toMatchObject({ serving: [ruler], faction: 2, advisor: 65535 });
      expect(graph.cities[4]?.free).toEqual(ruler === 9 ? [] : [9]);
      expect(graph.cities[4]?.hidden).toEqual(ruler === 10 ? [] : [10]);
      expect(after.officer(ruler)).toMatchObject({ role: 0, faction: 2, city: 4 });
      expect(after.read(governanceOfficer(ruler) + 10, 1)).toBe(0xe0);
      expect(after.read(governanceOfficer(ruler) + 2, 2)).toBe(0);
      expect(result.change).toMatchObject({
        previousFaction: 255,
        soldiersRemoved: 2222,
        upcomingPosition: null,
      });
    },
  );

  it("rejects cached cities, invalid roles/slots, battle and incomplete state before any mutation", () => {
    const valid = { faction: 2, city: 1, ruler: 3, human: 0 };
    for (const request of [
      { ...valid, faction: 0 },
      { ...valid, faction: 21 },
      { ...valid, city: 0, ruler: 1 },
      { ...valid, ruler: 7 },
      { ...valid, human: 2 },
    ])
      expect(() => createSan3Faction(new San3Document(fixture()), request)).toThrow();
    for (const [offset, value] of [
      [0x7878b, 1],
      [0x7878e, 25],
      [governanceCity(1) + 22, 1],
      [governanceOfficer(3) + 8, 0x90],
      [governanceOfficer(3) + 9, 8],
      [governanceOfficer(3) + 26, 7],
    ]) {
      const bytes = fixture();
      bytes[offset as number] = value as number;
      const document = new San3Document(bytes);
      expect(() => createSan3Faction(document, valid)).toThrow();
      expect(document.copy()).toEqual(new Uint8Array(bytes));
    }
    const bytes = fixture();
    bytes.writeUInt32BE(governanceCity(1), 0x7dc2a);
    expect(() => createSan3Faction(new San3Document(bytes), valid)).toThrow();
  });
});
