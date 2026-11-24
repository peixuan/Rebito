import { describe, expect, it } from "vitest";
import { San3Document } from "../../src/editors/san3/document.ts";
import { appointSan3Governor } from "../../src/editors/san3/governance-governor.ts";
import {
  governanceCity as city,
  governanceOfficer as officer,
  san3GovernanceFixture,
} from "./san3-governance-fixture.ts";

describe("SAN3 noncapital governor appointments", () => {
  it("repairs order, advisor and delegation while preserving armies and unknown bytes", () => {
    const original = san3GovernanceFixture();
    const document = new San3Document(Buffer.from(original));
    const result = appointSan3Governor(document, 1, 4);
    expect(result.change).toEqual({
      city: 1,
      previous: 3,
      successor: 4,
      formerRoleBefore: 4,
      formerRoleAfter: 3,
      advisorBefore: 4,
      advisorAfter: 65535,
      delegationBefore: 1,
      delegationAfter: 0,
    });
    const data = new DataView(result.bytes.buffer);
    expect(data.getUint16(city(1) + 4)).toBe(4);
    expect(data.getUint16(officer(4))).toBe(3);
    expect(data.getUint16(officer(3))).toBe(5);
    expect(data.getUint16(officer(3) + 2)).toBe(3000);
    expect(data.getUint16(officer(4) + 2)).toBe(3000);
    const restored = result.bytes.slice();
    const view = new DataView(restored.buffer);
    for (const { offset, width, before } of result.writes) {
      if (width === 1) view.setUint8(offset, before);
      else if (width === 2) view.setUint16(offset, before);
      else view.setUint32(offset, before);
    }
    expect(restored).toEqual(original);
    result.bytes.fill(0);
    expect(document.copy()).toEqual(original);
  });

  it("sets native delegation for military governors and keeps an unaffected advisor", () => {
    const bytes = san3GovernanceFixture();
    new DataView(bytes.buffer).setUint16(officer(3) + 2, 0);
    const result = appointSan3Governor(new San3Document(bytes), 1, 5);
    expect(result.change).toMatchObject({
      formerRoleAfter: 4,
      advisorAfter: 4,
      delegationAfter: 2,
    });
    expect(result.bytes[city(1) + 23]).toBe(0xa6);
  });

  it("rejects capitals, foreign or unlisted nominees, active transitions and broken chains", () => {
    const original = san3GovernanceFixture();
    const document = new San3Document(original);
    for (const [place, index] of [
      [0, 1],
      [1, 3],
      [1, 7],
      [1, 9],
      [1, 599],
      [46, 4],
      [1, 600],
      [1, 1.5],
    ])
      expect(() => appointSan3Governor(document, place as number, index as number)).toThrow();
    for (const index of [3, 4]) {
      for (const [relative, value] of [
        [8, 4],
        [8, 8],
        [8, 16],
        [9, 8],
        [9, 16],
        [9, 64],
        [11, 8],
        [11, 16],
        [26, 3],
        [27, 1],
      ]) {
        const bytes = original.slice();
        bytes[officer(index) + (relative as number)] = value as number;
        expect(() => appointSan3Governor(new San3Document(bytes), 1, 4)).toThrow();
      }
    }
    const broken = original.slice();
    new DataView(broken.buffer).setUint16(officer(5), 3);
    expect(() => appointSan3Governor(new San3Document(broken), 1, 4)).toThrow();
    expect(document.copy()).toEqual(original);
  });
});
