import { describe, expect, it } from "vitest";
import { San3Document } from "../../src/editors/san3/document.ts";
import { inspectSan3Lists } from "../../src/editors/san3/relocation.ts";
import { prepareSan3Relocation } from "../../src/editors/san3/relocation-effects.ts";
import {
  governanceCity as city,
  governanceOfficer as officer,
  san3GovernanceFixture,
} from "./san3-governance-fixture.ts";

function prepare(bytes: Uint8Array, indices: number[], faction: number) {
  const document = new San3Document(bytes);
  return prepareSan3Relocation(document, inspectSan3Lists(document), indices, faction);
}

describe("SAN3 departure effects", () => {
  it("retains a same-faction army, equipment and personal monthly state", () => {
    const bytes = Buffer.from(san3GovernanceFixture());
    bytes[officer(1) + 8] = 0x89;
    bytes[officer(1) + 9] = 0x9b;
    bytes[officer(1) + 10] = 0x7f;
    bytes[officer(1) + 11] = 0xeb;
    const original = Buffer.from(bytes);
    const result = prepare(bytes, [1], 0);
    const document = new San3Document(result.bytes);
    expect(document.read(officer(1) + 2, 2)).toBe(3000);
    expect(result.bytes.slice(officer(1) + 9, officer(1) + 12)).toEqual(
      new Uint8Array([0x9b, 0x7f, 0xeb]),
    );
    expect(result.bytes[officer(1) + 8]).toBe(0x88);
    expect(result.refunds).toEqual([]);
    expect(result.bytes.slice(officer(1) + 21, officer(1) + 23)).toEqual(new Uint8Array([67, 78]));
    result.bytes[123] = 0;
    expect(bytes).toEqual(original);
  });

  it("detaches only the moved participants and releases a city task bit when empty", () => {
    const bytes = san3GovernanceFixture();
    bytes[city(0) + 24] = 0x25;
    for (const index of [1, 2]) {
      bytes[officer(index) + 9] = 0xc0;
      bytes[officer(index) + 26] = 2;
      bytes[officer(index) + 27] = 0x13;
      bytes[officer(index) + 29] = 17;
    }
    const one = prepare(bytes, [1], 0);
    expect(one.bytes[city(0) + 24]).toBe(0x25);
    expect(one.bytes.slice(officer(2), officer(2) + 30)).toEqual(
      bytes.slice(officer(2), officer(2) + 30),
    );
    expect(one.bytes.slice(officer(1) + 26, officer(1) + 30)).toEqual(
      new Uint8Array([255, 0, 0, 0]),
    );
    const all = prepare(bytes, [1, 2], 0);
    expect(all.bytes[city(0) + 24]).toBe(0x21);
    expect(all.cancelledTasks).toEqual([
      { index: 1, kind: 2 },
      { index: 2, kind: 2 },
    ]);
  });

  it("refunds capped source stocks before releasing a cross-faction army", () => {
    const bytes = san3GovernanceFixture();
    const data = new DataView(bytes.buffer);
    bytes[city(0) + 21] = 128;
    data.setUint16(city(0) + 40, 9980);
    bytes[city(0) + 44] = 99;
    for (const index of [1, 2]) {
      bytes[officer(index) + 8] = 0x88;
      bytes[officer(index) + 9] = 0x9b;
      bytes[officer(index) + 10] = 0x79;
      bytes[officer(index) + 11] = 0xeb;
      bytes[officer(index) + 19] = 1;
      bytes[officer(index) + 20] = 7;
    }
    const result = prepare(bytes, [1, 2], 1);
    const output = new San3Document(result.bytes);
    expect(output.read(city(0) + 40, 2)).toBe(9999);
    expect(output.read(city(0) + 44, 1)).toBe(100);
    expect(result.refunds.map(({ requested, returned }) => [requested, returned])).toEqual([
      [30, 19],
      [1, 1],
      [30, 0],
      [1, 0],
    ]);
    for (const index of [1, 2]) {
      expect(output.read(officer(index) + 2, 2)).toBe(0);
      expect(result.bytes.slice(officer(index) + 8, officer(index) + 12)).toEqual(
        new Uint8Array([128, 128, 112, 224]),
      );
      expect(result.bytes.slice(officer(index) + 18, officer(index) + 23)).toEqual(
        new Uint8Array([1, 255, 0, 0, 0]),
      );
    }
  });

  it("reports a non-port vessel loss and rejects malformed stocks or battle state atomically", () => {
    const bytes = san3GovernanceFixture();
    bytes[officer(1) + 10] = 0x74;
    expect(prepare(bytes, [1], 1).refunds).toEqual([
      { city: 0, stock: "heavyWarships", requested: 1, returned: 0 },
    ]);
    for (const flags of [4, 16]) {
      const input = Uint8Array.from(bytes);
      input[officer(1) + 8] = 0x80 | flags;
      const original = Uint8Array.from(input);
      expect(() => prepare(input, [1], 1)).toThrow();
      expect(input).toEqual(original);
    }
    bytes[city(0) + 21] = 128;
    bytes[city(0) + 43] = 101;
    expect(() => prepare(bytes, [1], 1)).toThrow();
  });
});
