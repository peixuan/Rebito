import { describe, expect, it } from "vitest";
import { San3BattleDocument } from "../../src/editors/san3/battle.ts";
import {
  editSan3ReserveDeployment,
  inspectSan3BattleReserves,
} from "../../src/editors/san3/battle-reserves.ts";
import { san3Layout } from "../../src/editors/san3/document.ts";
import { san3ReserveFixture } from "./san3-reserve-fixture.ts";

const officer = (index: number) => san3Layout.officers.offset + index * 30;
const city = san3Layout.cities.offset + san3Layout.cities.stride;
const deployed = new Set([0, 1, 2]);

describe("SAN3 city reserve deployment eligibility", () => {
  it("normalizes retirement markers and resets only eligibility, never map membership", () => {
    const bytes = san3ReserveFixture();
    const original = bytes.slice();
    const key = "reserve.3.deploymentUsed";
    const blocked = editSan3ReserveDeployment(bytes, deployed, { [key]: 1 });
    const expected = bytes.slice();
    expected[officer(3) + 8] = 0x85;
    expected.fill(255, officer(3) + 24, officer(3) + 27);
    expected.fill(255, officer(3) + 28, officer(3) + 30);
    expect(blocked.bytes).toEqual(expected);
    expect(bytes).toEqual(original);
    expect(inspectSan3BattleReserves(blocked.bytes, deployed).retired).toEqual(new Set([3]));
    expect(new San3BattleDocument(blocked.bytes).indexes()).toEqual([1, 2, 0]);
    const reset = editSan3ReserveDeployment(blocked.bytes, deployed, { [key]: 0 });
    expected[officer(3) + 8] = 0x81;
    expect(reset.bytes).toEqual(expected);
    expect(reset.writes).toHaveLength(1);
    expect(editSan3ReserveDeployment(reset.bytes, deployed, { [key]: 0 }).writes).toEqual([]);
  });

  it("preserves native retreat penalties, cached intelligence and unknown bytes", () => {
    const bytes = editSan3ReserveDeployment(san3ReserveFixture(), deployed, {
      "reserve.3.deploymentUsed": 1,
    }).bytes;
    bytes[officer(3) + 22] = 30;
    bytes[officer(3) + 27] = 58;
    const result = editSan3ReserveDeployment(bytes, deployed, { "reserve.3.deploymentUsed": 0 });
    const expected = bytes.slice();
    expected[officer(3) + 8] = 0x81;
    expect(result.bytes).toEqual(expected);
    expect(inspectSan3BattleReserves(result.bytes, deployed).reserves[0]).toMatchObject({
      index: 3,
      name: "D",
      city: 1,
      soldiers: 1500,
      deploymentUsed: 0,
    });
  });

  it("rejects forged edits and mixed invalid batches without changing the input", () => {
    const bytes = san3ReserveFixture();
    const before = bytes.slice();
    for (const [key, value] of [
      ["reserve.0.deploymentUsed", 1],
      ["reserve.03.deploymentUsed", 1],
      ["reserve.600.deploymentUsed", 1],
      ["reserve.3.soldiers", 2000],
      ["reserve.4.deploymentUsed", -1],
      ["reserve.4.deploymentUsed", 2],
      ["reserve.4.deploymentUsed", Number.NaN],
    ] as const)
      expect(() =>
        editSan3ReserveDeployment(bytes, deployed, { "reserve.3.deploymentUsed": 1, [key]: value }),
      ).toThrow();
    expect(bytes).toEqual(before);
  });

  it("requires a consistent city graph and complete native withdrawal sentinels", () => {
    const retired = editSan3ReserveDeployment(san3ReserveFixture(), deployed, {
      "reserve.3.deploymentUsed": 1,
    }).bytes;
    const mutations: ((bytes: Uint8Array, data: DataView) => void)[] = [
      (_, data) => data.setUint32(0x4ab2c, city + 1),
      (_, data) => data.setUint16(0x52056, 1),
      (_, data) => data.setUint32(0x4b504, san3Layout.factions.offset),
      (_, data) => data.setUint16(officer(4), 3),
      (_, data) => data.setUint16(officer(4), 2),
      (_, data) => data.setUint16(officer(4), 600),
      (_, data) => data.setUint16(city + 4, 4),
      (bytes) => {
        bytes[officer(3) + 17] = 0;
      },
      (bytes) => {
        bytes[officer(3) + 23] = 1;
      },
      (bytes) => {
        bytes[officer(3) + 24] = 1;
      },
      (bytes) => {
        bytes[officer(3) + 26] = 0;
      },
      (bytes) => {
        bytes[officer(3) + 28] = 0;
      },
      (bytes) => {
        bytes[officer(3) + 10] = 0x71;
      },
    ];
    for (const mutate of mutations) {
      const bytes = retired.slice();
      mutate(bytes, new DataView(bytes.buffer));
      expect(() => new San3BattleDocument(bytes)).toThrow();
    }
  });

  it("excludes naval/field battles, rulers, civil officials and unavailable reserves", () => {
    for (const [relative, value] of [
      [12, 0],
      [12, 4],
      [9, 0x40],
      [8, 0x10],
      [10, 1],
      [26, 3],
    ] as const) {
      const bytes = san3ReserveFixture();
      bytes[officer(3) + relative] = value;
      expect(inspectSan3BattleReserves(bytes, deployed).reserves.map(({ index }) => index)).toEqual(
        [4],
      );
    }
    const bytes = san3ReserveFixture();
    const data = new DataView(bytes.buffer);
    data.setUint32(0x4ab2c, 0);
    for (const mode of [0, 1]) {
      data.setUint16(0x52056, mode);
      expect(inspectSan3BattleReserves(bytes, deployed).reserves).toEqual([]);
    }
  });
});
