import { describe, expect, it } from "vitest";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { inspectSan3Governance } from "../../src/editors/san3/governance-core.ts";
import { inspectSan3Lists } from "../../src/editors/san3/relocation.ts";
import { prepareSan3Relocation } from "../../src/editors/san3/relocation-effects.ts";
import { rebuildSan3RelocationRosters } from "../../src/editors/san3/relocation-rosters.ts";
import {
  governanceCity as city,
  governanceOfficer as officer,
  san3GovernanceFixture,
} from "./san3-governance-fixture.ts";

function relocate(bytes: Uint8Array, indices: number[], destination: number) {
  const document = new San3Document(bytes);
  const graph = inspectSan3Lists(document);
  const prepared = prepareSan3Relocation(
    document,
    graph,
    indices,
    document.city(destination).faction,
  );
  const result = rebuildSan3RelocationRosters(
    document,
    graph,
    indices,
    destination,
    prepared.bytes,
  );
  inspectSan3Governance(new San3Document(result.bytes));
  return result;
}

describe("SAN3 relocation roster transactions", () => {
  it("moves an armed governor and automatically maintains both city offices", () => {
    const bytes = san3GovernanceFixture();
    const result = relocate(bytes, [3], 0);
    const document = new San3Document(result.bytes);
    expect(document.officer(3)).toMatchObject({ city: 0, role: 3, soldiers: 3000, training: 67 });
    expect(document.read(city(1) + 4, 2)).toBe(4);
    expect(document.read(city(1) + 10, 2)).toBe(65535);
    expect(document.read(city(1) + 23, 1) & 3).toBe(0);
    expect(document.read(officer(2), 2)).toBe(3);
    expect(result.abandoned).toEqual([]);
  });

  it("moves the ruler with the capital, retaining faction identity and armies", () => {
    const bytes = Buffer.from(san3GovernanceFixture());
    const original = Buffer.from(bytes);
    const result = relocate(bytes, [0], 1);
    const document = new San3Document(result.bytes);
    expect(document.officer(0)).toMatchObject({ city: 1, role: 0, soldiers: 3000 });
    expect(document.officer(3)).toMatchObject({ role: 3, soldiers: 3000 });
    expect(document.read(city(0) + 4, 2)).toBe(1);
    expect(document.read(city(1) + 4, 2)).toBe(0);
    expect(document.read(city(1) + 10, 2)).toBe(4);
    expect(inspectSan3Governance(document).factionCities[0]).toEqual([1, 0, 2]);
    expect(result.capitals).toEqual([{ faction: 0, before: 0, after: 1 }]);
    result.bytes[123] = 0;
    expect(bytes).toEqual(original);
  });

  it("neutralizes an empty source and cancels agreements and spy missions targeting it", () => {
    const bytes = san3GovernanceFixture();
    bytes[city(2) + 21] = 0xff;
    bytes[city(2) + 22] = 0xbe;
    bytes[city(2) + 23] = 0xff;
    bytes[san3Layout.factions.offset + 50 + 36] = 0;
    bytes[san3Layout.factions.offset + 50 + 37] = 2;
    bytes[officer(7) + 9] = 0xc0;
    bytes[officer(7) + 26] = 7;
    bytes[officer(7) + 27] = 3;
    bytes[officer(7) + 28] = 2;
    const result = relocate(bytes, [8], 0);
    const document = new San3Document(result.bytes);
    expect(document.city(2).faction).toBe(255);
    expect(document.read(city(2), 4)).toBe(0);
    expect(result.bytes.slice(city(2) + 21, city(2) + 28)).toEqual(
      new Uint8Array([0x8f, 0x30, 0x40, 0, 0, 255, 255]),
    );
    expect(inspectSan3Governance(document).factionCities[0]).toEqual([0, 1]);
    expect(result.abandoned).toEqual([2]);
    expect(result.cancelledAgreements).toEqual([1]);
    expect(result.cancelledSpies).toEqual([7]);
    expect(document.read(officer(7) + 9, 1)).toBe(128);
    expect(document.read(officer(7) + 26, 1)).toBe(255);
  });

  it("rejects implicit ruler defection and emptying the running city without mutating input", () => {
    const bytes = san3GovernanceFixture();
    expect(() => relocate(bytes, [0], 3)).toThrow();
    expect(() => relocate(bytes, [0], 4)).toThrow();
    new DataView(bytes.buffer).setUint32(0x7dc2a, city(2));
    const original = Uint8Array.from(bytes);
    expect(() => relocate(bytes, [8], 0)).toThrow();
    expect(bytes).toEqual(original);
  });
});
