import { describe, expect, it } from "vitest";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { abandonSan3City } from "../../src/editors/san3/governance-abandon.ts";
import { inspectSan3Governance } from "../../src/editors/san3/governance-core.ts";
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
  data.setUint16(city(4) + 6, 65535);
  data.setUint16(city(4) + 8, 65535);
  data.setUint16(city(1) + 6, 9);
  data.setUint16(city(1) + 8, 10);
  bytes[officer(9) + 16] = 1;
  bytes[officer(10) + 16] = 1;
  return bytes;
}

describe("SAN3 city abandonment", () => {
  it("releases the entire serving list and preserves residents, belongings and resources", () => {
    const original = fixture();
    const data = new DataView(original.buffer);
    data.setUint16(san3TreasureLayout.owners + 2, 4);
    data.setUint16(officer(4) + 4, 2);
    original[city(1) + 21] = 0xff;
    original[city(1) + 22] = 0xbe;
    original[city(1) + 23] = 0xfd;
    original[san3Layout.factions.offset + 36] = 1;
    original[san3Layout.factions.offset + 37] = 1;
    const document = new San3Document(Buffer.from(original));
    const result = abandonSan3City(document, 1);
    const changed = new San3Document(result.bytes);
    const graph = inspectSan3Governance(changed);
    expect(graph.factionCities[0]).toEqual([0, 2]);
    expect(graph.cities[1]).toMatchObject({
      faction: 255,
      serving: [],
      free: [3, 4, 5, 9],
      hidden: [10],
      advisor: 65535,
    });
    for (const index of [3, 4, 5])
      expect(changed.officer(index)).toMatchObject({ role: 5, faction: 255, soldiers: 0 });
    expect(inspectSan3Treasures(changed).items[1]?.owner).toBe(4);
    expect([...result.bytes.subarray(city(1) + 21, city(1) + 28)]).toEqual([
      0x8f, 0x30, 0x40, 0, 0, 255, 255,
    ]);
    expect(result.change.officers.reduce((total, entry) => total + entry.soldiersRemoved, 0)).toBe(
      9000,
    );
    expect(result.change.cancelledJointAgreements).toEqual([0]);
    expect(result.bytes[san3Layout.factions.offset + 36]).toBe(255);
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

  it("requires succession for capitals and a settled city outside the current command", () => {
    const original = fixture();
    for (const index of [0, 3, 4, 46])
      expect(() => abandonSan3City(new San3Document(original), index)).toThrow();
    for (const [offset, value] of [
      [officer(4) + 9, 64],
      [officer(5) + 10, 1],
      [city(1) + 22, 1],
    ]) {
      const bytes = original.slice();
      bytes[offset as number] = value as number;
      expect(() => abandonSan3City(new San3Document(bytes), 1)).toThrow();
    }
    const current = original.slice();
    new DataView(current.buffer).setUint32(0x7dc2a, city(1));
    expect(() => abandonSan3City(new San3Document(current), 1)).toThrow();
    const unsettledSuccession = original.slice();
    unsettledSuccession[officer(0) + 8] = 16;
    expect(() => abandonSan3City(new San3Document(unsettledSuccession), 1)).toThrow();
    const spy = original.slice();
    spy[officer(7) + 9] = 64;
    spy[officer(7) + 26] = 7;
    spy[officer(7) + 28] = 1;
    expect(() => abandonSan3City(new San3Document(spy), 1)).toThrow();
    const broken = original.slice();
    new DataView(broken.buffer).setUint16(officer(5), 3);
    expect(() => abandonSan3City(new San3Document(broken), 1)).toThrow();
  });
});
