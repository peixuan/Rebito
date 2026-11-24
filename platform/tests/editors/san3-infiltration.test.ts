import { describe, expect, it } from "vitest";
import { San3Document } from "../../src/editors/san3/document.ts";
import {
  deploySan3Infiltrator,
  endSan3Infiltration,
  establishSan3Infiltration,
} from "../../src/editors/san3/infiltration.ts";
import { inspectSan3Lists } from "../../src/editors/san3/relocation.ts";
import {
  governanceCity as city,
  governanceOfficer as officer,
  san3GovernanceFixture,
} from "./san3-governance-fixture.ts";

function fixture() {
  const bytes = san3GovernanceFixture();
  const data = new DataView(bytes.buffer);
  data.setUint16(officer(2) + 2, 0);
  bytes[officer(2) + 18] = 7;
  bytes[officer(2) + 20] = 17;
  return bytes;
}

describe("SAN3 native covert deployment and insider affiliation", () => {
  it("moves an unarmed agent from serving to the foreign free list with native dependent cleanup", () => {
    const original = Buffer.from(fixture());
    const document = new San3Document(original);
    const result = deploySan3Infiltrator(document, 2, 3);
    const after = new San3Document(result.bytes);
    const graph = inspectSan3Lists(after);
    expect(graph.cities[0]?.serving).toEqual([0, 1]);
    expect(graph.cities[3]?.serving).toEqual([6, 7]);
    expect(graph.cities[3]?.free).toEqual([2]);
    expect(graph.cities[0]?.advisor).toBe(0xffff);
    expect(after.read(officer(2) + 11, 1)).toBe(0xe8);
    expect(after.read(officer(2) + 12, 1)).toBe(5);
    expect(after.read(officer(2) + 15, 1)).toBe(0);
    expect(after.read(officer(2) + 17, 1)).toBe(255);
    expect(after.read(officer(2) + 18, 1)).toBe(0);
    expect(after.read(officer(2) + 19, 1)).toBe(0);
    expect(after.read(officer(2) + 20, 1)).toBe(7);
    expect(after.read(officer(2) + 21, 1)).toBe(0);
    expect(after.read(officer(2) + 22, 1)).toBe(0);
    expect(after.read(officer(2) + 26, 1)).toBe(255);
    const restored = result.bytes.slice();
    const view = new DataView(restored.buffer);
    for (const { offset, width, before } of result.writes) {
      if (width === 1) view.setUint8(offset, before);
      else view.setUint16(offset, before);
    }
    expect(restored).toEqual(new Uint8Array(original));
    expect(document.copy()).toEqual(new Uint8Array(original));
    expect(original).toEqual(Buffer.from(fixture()));
  });

  it("ends a free agent's covert relationship without recruiting or moving them", () => {
    const deployed = deploySan3Infiltrator(new San3Document(fixture()), 2, 3);
    const ended = endSan3Infiltration(new San3Document(deployed.bytes), 2);
    expect(ended.writes.map(({ offset }) => offset)).toEqual([officer(2) + 11, officer(2) + 19]);
    expect(ended.bytes[officer(2) + 11]).toBe(0xe0);
    expect(ended.bytes[officer(2) + 19]).toBe(255);
    expect(ended.bytes[officer(2) + 20]).toBe(7);
    expect(inspectSan3Lists(new San3Document(ended.bytes)).cities[3]?.free).toEqual([2]);
  });

  it("creates an already-hired insider with explicit origin service while keeping all other state", () => {
    const original = fixture();
    const document = new San3Document(original);
    const result = establishSan3Infiltration(document, 2, 1, 249);
    expect(result.writes.map(({ offset }) => offset)).toEqual([
      officer(2) + 11,
      officer(2) + 19,
      officer(2) + 20,
    ]);
    expect(result.bytes[officer(2) + 17]).toBe(0);
    expect(result.bytes[officer(2) + 20]).toBe(249);
    expect(inspectSan3Lists(new San3Document(result.bytes)).cities[0]?.serving).toEqual([0, 1, 2]);
    expect(() => establishSan3Infiltration(document, 2, 1, 250)).toThrow();
    expect(() => establishSan3Infiltration(document, 2, 0, 1)).toThrow();
    expect(() => establishSan3Infiltration(document, 2, 2, 1)).toThrow();
    expect(() => establishSan3Infiltration(document, 2, 1, -1)).toThrow();
  });

  it("refuses to discard armies, equipment, leadership, missions or existing covert states", () => {
    for (const [offset, value] of [
      [3, 1],
      [10, 0x71],
      [8, 0x84],
      [8, 0x88],
      [8, 0x90],
      [9, 0x81],
      [9, 0xa0],
      [9, 0xc0],
      [11, 0xe8],
      [11, 0xf0],
      [26, 1],
      [27, 1],
    ] as const) {
      const bytes = fixture();
      bytes[officer(2) + offset] = value;
      expect(() => deploySan3Infiltrator(new San3Document(bytes), 2, 3)).toThrow();
    }
    const document = new San3Document(fixture());
    for (const [index, destination] of [
      [0, 3],
      [3, 3],
      [9, 3],
      [10, 3],
      [2, 0],
      [2, 1],
      [2, 4],
      [2, 46],
      [600, 3],
    ])
      expect(() =>
        deploySan3Infiltrator(document, index as number, destination as number),
      ).toThrow();
    expect(() => endSan3Infiltration(document, 2)).toThrow();
    const malformed = fixture();
    new DataView(malformed.buffer).setUint16(city(3) + 6, 2);
    expect(() => deploySan3Infiltrator(new San3Document(malformed), 2, 3)).toThrow();
  });

  it("preserves unknown covert states and rejects conflicting allegiance contracts during cleanup", () => {
    const established = establishSan3Infiltration(new San3Document(fixture()), 2, 1);
    for (const [offset, value] of [
      [11, 0xf8],
      [8, 0x88],
      [9, 0xb0],
    ] as const) {
      const bytes = established.bytes.slice();
      bytes[officer(2) + offset] = value;
      expect(() => endSan3Infiltration(new San3Document(bytes), 2)).toThrow();
    }
  });
});
