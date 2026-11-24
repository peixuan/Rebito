import { describe, expect, it } from "vitest";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { inspectSan3Governance } from "../../src/editors/san3/governance-core.ts";
import { transferSan3City } from "../../src/editors/san3/governance-ownership.ts";
import {
  governanceCity as city,
  governanceOfficer as officer,
  san3GovernanceFixture,
} from "./san3-governance-fixture.ts";

describe("SAN3 coherent city ownership", () => {
  it("moves the city chain and all serving allegiances while preserving resources and armies", () => {
    const original = san3GovernanceFixture();
    original[officer(3) + 10] = 0x75;
    original[officer(4) + 18] = 23;
    original[officer(4) + 19] = 0;
    original[officer(4) + 20] = 17;
    const input = Buffer.from(original);
    const document = new San3Document(input);
    const result = transferSan3City(document, 1, 1);
    const changed = new San3Document(result.bytes);
    const graph = inspectSan3Governance(changed);
    expect(graph.factionCities[0]).toEqual([0, 2]);
    expect(graph.factionCities[1]).toEqual([3, 1]);
    expect(graph.cities[1]).toMatchObject({ serving: [3, 4, 5], advisor: 4, faction: 1 });
    expect(result.change).toMatchObject({
      previousFaction: 0,
      faction: 1,
      governor: 3,
      soldiersRemoved: 0,
    });
    for (const index of [3, 4, 5]) {
      expect(changed.read(officer(index) + 2, 2)).toBe(3000);
      expect([...result.bytes.subarray(officer(index) + 15, officer(index) + 21)]).toEqual([
        100, 1, 1, 1, 255, 0,
      ]);
    }
    expect(result.change.allegiances[1]?.before).toMatchObject({
      service: 23,
      originFaction: 0,
      originService: 17,
    });
    const restored = result.bytes.slice();
    const data = new DataView(restored.buffer);
    for (const { offset, width, before } of result.writes) {
      if (width === 1) data.setUint8(offset, before);
      else if (width === 2) data.setUint16(offset, before);
      else data.setUint32(offset, before);
    }
    expect(restored).toEqual(original);
    result.bytes.fill(0);
    expect(document.copy()).toEqual(original);
    expect(new Uint8Array(input)).toEqual(original);
  });

  it("settles neutral cities using a named local hidden officer or an unallocated serving officer", () => {
    const original = san3GovernanceFixture();
    const local = transferSan3City(new San3Document(original), 4, 1, 10);
    const localGraph = inspectSan3Governance(new San3Document(local.bytes));
    expect(localGraph.cities[4]).toMatchObject({
      serving: [10],
      free: [9],
      hidden: [],
      faction: 1,
    });
    expect(local.bytes[officer(10) + 12]).toBe(4);
    expect(local.bytes[city(4) + 23]).toBe(0xa6);
    const incoming = transferSan3City(new San3Document(original), 4, 0, 4);
    const incomingGraph = inspectSan3Governance(new San3Document(incoming.bytes));
    expect(incoming.change).toMatchObject({ previousCity: 1, soldiersRemoved: 3000 });
    expect(incomingGraph.cities[1]).toMatchObject({ serving: [3, 5], advisor: 65535 });
    expect(incomingGraph.cities[4]).toMatchObject({
      serving: [4],
      free: [9],
      hidden: [10],
      advisor: 65535,
    });
    expect(new DataView(incoming.bytes.buffer).getUint16(officer(4) + 2)).toBe(0);
    expect(incoming.bytes[officer(4) + 21]).toBe(0);
    expect(incoming.bytes[officer(4) + 22]).toBe(0);
  });

  it("rejects capital dissolution, ambiguous neutral leadership, active transitions and malformed graphs", () => {
    const original = san3GovernanceFixture();
    const document = new San3Document(original);
    for (const args of [
      [0, 1],
      [1, 0],
      [1, 2],
      [1, 1, 4],
      [4, 1],
      [4, 1, 3],
      [4, 1, 4],
      [46, 1],
      [1, 21],
    ])
      expect(() =>
        transferSan3City(document, args[0] as number, args[1] as number, args[2]),
      ).toThrow();
    for (const [relative, value] of [
      [8, 4],
      [8, 8],
      [8, 16],
      [9, 8],
      [9, 16],
      [9, 64],
      [11, 8],
      [26, 3],
      [27, 1],
    ]) {
      const bytes = original.slice();
      bytes[officer(5) + (relative as number)] = value as number;
      expect(() => transferSan3City(new San3Document(bytes), 1, 1)).toThrow();
    }
    const equipped = original.slice();
    equipped[officer(4) + 10] = 1;
    expect(() => transferSan3City(new San3Document(equipped), 4, 0, 4)).toThrow();
    const broken = original.slice();
    new DataView(broken.buffer).setUint32(city(2), city(1));
    expect(() => transferSan3City(new San3Document(broken), 1, 1)).toThrow();
    const current = original.slice();
    new DataView(current.buffer).setUint32(0x7dc2a, city(1));
    expect(() => transferSan3City(new San3Document(current), 1, 1)).toThrow();
    const spy = original.slice();
    spy[officer(7) + 9] = 64;
    spy[officer(7) + 26] = 7;
    spy[officer(7) + 28] = 1;
    expect(() => transferSan3City(new San3Document(spy), 1, 1)).toThrow();
    expect(document.read(san3Layout.factions.offset + 2, 4)).toBe(city(0));
    expect(document.copy()).toEqual(original);
  });
});
