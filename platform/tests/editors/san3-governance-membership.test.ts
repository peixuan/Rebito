import { describe, expect, it } from "vitest";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { inspectSan3Governance } from "../../src/editors/san3/governance-core.ts";
import { setSan3OfficerPresence } from "../../src/editors/san3/governance-membership.ts";
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
  for (let index = 0; index < 532; index++)
    data.setUint16(san3Layout.historical.offset + index * 30, 1);
  return bytes;
}

describe("SAN3 free and hidden membership", () => {
  it("resigns an advisor without losing belongings or leaving a stale serving link", () => {
    const original = fixture();
    const data = new DataView(original.buffer);
    data.setUint16(san3TreasureLayout.owners + 2, 2);
    data.setUint16(officer(2) + 4, 2);
    const document = new San3Document(Buffer.from(original));
    const result = setSan3OfficerPresence(document, 2, 5);
    const changed = new San3Document(result.bytes);
    expect(inspectSan3Governance(changed).cities[0]).toMatchObject({
      serving: [0, 1],
      free: [2],
      advisor: 65535,
    });
    expect(changed.officer(2)).toMatchObject({ role: 5, faction: 255, city: 0, soldiers: 0 });
    expect(inspectSan3Treasures(changed).items[1]?.owner).toBe(2);
    expect(result.change).toMatchObject({
      soldiersRemoved: 3000,
      advisorRemoved: true,
      introduced: false,
    });
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

  it("moves free and hidden list heads coherently in both directions", () => {
    const hidden = setSan3OfficerPresence(new San3Document(fixture()), 9, 6);
    expect(inspectSan3Governance(new San3Document(hidden.bytes)).cities[4]).toMatchObject({
      free: [],
      hidden: [9, 10],
    });
    const revealed = setSan3OfficerPresence(new San3Document(hidden.bytes), 10, 5);
    expect(inspectSan3Governance(new San3Document(revealed.bytes)).cities[4]).toMatchObject({
      free: [10],
      hidden: [9],
    });
    expect(revealed.change.soldiersRemoved).toBe(0);
  });

  it("recruits a local free officer and can introduce a civil officer into an owned city", () => {
    const resigned = setSan3OfficerPresence(new San3Document(fixture()), 2, 5);
    const recruited = setSan3OfficerPresence(new San3Document(resigned.bytes), 2, 4);
    const document = new San3Document(recruited.bytes);
    expect(inspectSan3Governance(document).cities[0]).toMatchObject({
      serving: [0, 1, 2],
      free: [],
      advisor: 65535,
    });
    expect(document.officer(2)).toMatchObject({ role: 4, faction: 0, loyalty: 100, soldiers: 0 });
    const introduced = setSan3OfficerPresence(new San3Document(fixture()), 11, 4, 1);
    expect(inspectSan3Governance(new San3Document(introduced.bytes)).cities[1]?.serving).toEqual([
      3, 4, 5, 11,
    ]);
    expect(() => setSan3OfficerPresence(new San3Document(fixture()), 9, 4)).toThrow();
  });

  it("introduces a valid unappeared definition only with an explicit destination", () => {
    const bytes = fixture();
    new DataView(bytes.buffer).setUint16(officer(11) + 4, 1);
    const introduced = setSan3OfficerPresence(new San3Document(bytes), 11, 6, 4);
    const changed = new San3Document(introduced.bytes);
    expect(introduced.change.introduced).toBe(true);
    expect(inspectSan3Governance(changed).cities[4]?.hidden).toEqual([11, 10]);
    expect(changed.read(officer(11) + 4, 2)).toBe(0);
    expect(inspectSan3Treasures(changed).total).toBe(0);
  });

  it("rejects implicit relocation, leaders, active assignments, deaths and unregistered slots", () => {
    const original = fixture();
    for (const [index, role, destination] of [
      [0, 5],
      [3, 6],
      [2, 4],
      [9, 5],
      [9, 6, 0],
      [11, 5],
      [599, 5, 4],
    ])
      expect(() =>
        setSan3OfficerPresence(
          new San3Document(original),
          index as number,
          role as number,
          destination,
        ),
      ).toThrow();
    for (const [relative, value] of [
      [8, 16],
      [9, 64],
      [10, 1],
      [11, 8],
      [26, 7],
    ]) {
      const bytes = original.slice();
      bytes[officer(2) + (relative as number)] = value as number;
      expect(() => setSan3OfficerPresence(new San3Document(bytes), 2, 5)).toThrow();
    }
    const linkedDead = original.slice();
    linkedDead[officer(11) + 8] = 16;
    expect(() => setSan3OfficerPresence(new San3Document(linkedDead), 11, 5, 4)).toThrow();
    const badCustom = original.slice();
    new DataView(badCustom.buffer).setUint16(san3Layout.custom.offset + 67 * 28, 231);
    expect(() => setSan3OfficerPresence(new San3Document(badCustom), 599, 5, 4)).toThrow();
    expect(new San3Document(original).read(city(0) + 4, 2)).toBe(0);
  });
});
