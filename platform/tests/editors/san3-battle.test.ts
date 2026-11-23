import { describe, expect, it } from "vitest";
import { battleFields, editSan3Battle, San3BattleDocument } from "../../src/editors/san3/battle.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { san3BattleFixture } from "./san3-battle-fixture.ts";

const officer = (index: number) => san3Layout.officers.offset + index * san3Layout.officers.stride;

describe("Japanese Mega-CD land battle mobility", () => {
  it("owns buffers and exposes only deployed army members through a separate schema", () => {
    const bytes = san3BattleFixture();
    expect(() => new San3Document(bytes)).toThrow();
    const document = new San3BattleDocument(bytes);
    bytes.fill(0);
    expect(document.indexes()).toEqual([1, 2, 0]);
    expect(document.selected).toBe(0);
    expect(document.officer(0)).toMatchObject({ index: 0, name: "A", faction: 0, mobility: 5 });
    expect(battleFields(document, 0)).toMatchObject([
      {
        key: "battle.0.mobility",
        value: 5,
        min: 0,
        max: 90,
        width: 1,
        offset: officer(0) + 23,
        help: { messageId: "san3.battleMobilityHelp" },
      },
    ]);
    document.copy().fill(0);
    for (const index of [-1, 0.5, 3, 600, Number.NaN])
      expect(() => document.officer(index)).toThrow();
    expect(document.officer(0).mobility).toBe(5);
  });

  it("rejects other overlays, naval combat, changed consumers and invalid battle graphs", () => {
    expect(() => new San3BattleDocument(new Uint8Array(100))).toThrow();
    for (const offset of [
      0x78000, 0x78776, 0x4abc5, 0x52057, 0x54003, 0x27ba7, 0x27bc7, 0x6532c, 0x65331, 0x65614,
      0x65619,
    ]) {
      const bytes = san3BattleFixture();
      bytes[offset] = (bytes[offset] ?? 0) ^ 1;
      expect(() => new San3BattleDocument(bytes), offset.toString(16)).toThrow();
    }
    const mutations: ((bytes: Uint8Array, view: DataView) => void)[] = [
      (_, view) => view.setUint16(0x78788, 0),
      (bytes) => {
        bytes[0x7878a] = 12;
      },
      (_, view) => view.setUint16(0x52058, 3),
      (_, view) => view.setUint16(0x4b504 + 6, 600),
      (_, view) => view.setUint16(0x4b504 + 6, 0xffff),
      (_, view) => view.setUint32(0x4b504, san3Layout.factions.offset + 1),
      (_, view) => view.setUint16(san3Layout.factions.offset, 0xffff),
      (_, view) => view.setUint32(san3Layout.factions.offset + 2, 0),
      (bytes) => {
        bytes[san3Layout.cities.offset + 20] = 1;
      },
      (_, view) => view.setUint16(officer(2), 1),
      (_, view) => view.setUint16(officer(2), 0),
      (_, view) => view.setUint16(officer(2), 600),
      (bytes) => {
        bytes[officer(2) + 17] = 0;
      },
      (bytes) => {
        bytes[officer(2) + 8] = 1;
      },
      (bytes) => {
        bytes[officer(2) + 8] = 21;
      },
      (bytes) => {
        bytes[officer(2) + 8] = 13;
      },
      (bytes) => {
        bytes[officer(3) + 8] = 5;
      },
      (bytes) => {
        bytes[officer(2) + 12] = 4;
      },
      (bytes) => {
        bytes[officer(2) + 16] = 46;
      },
      (_, view) => view.setUint16(officer(2) + 2, 0),
      (_, view) => view.setUint16(officer(2) + 2, 20_001),
      (bytes) => {
        bytes[officer(2) + 21] = 101;
      },
      (bytes) => {
        bytes[officer(2) + 22] = 121;
      },
      (bytes) => {
        bytes[officer(2) + 23] = 91;
      },
    ];
    for (const mutate of mutations) {
      const bytes = san3BattleFixture();
      mutate(bytes, new DataView(bytes.buffer));
      expect(() => new San3BattleDocument(bytes)).toThrow();
    }
  });

  it("accepts native combat morale above 100 without changing it during mobility edits", () => {
    for (const morale of [101, 120]) {
      const bytes = san3BattleFixture();
      bytes[officer(0) + 22] = morale;
      const document = new San3BattleDocument(bytes);
      const result = editSan3Battle(document, { "battle.0.mobility": 90 });
      const expected = bytes.slice();
      expected[officer(0) + 23] = 90;
      expect(result.bytes).toEqual(expected);
      expect(new San3BattleDocument(result.bytes).officer(0).mobility).toBe(90);
    }
  });

  it("writes boundary values without changing unrelated bytes and rejects drafts atomically", () => {
    const bytes = san3BattleFixture();
    const document = new San3BattleDocument(bytes);
    const result = editSan3Battle(document, { "battle.0.mobility": 90, "battle.2.mobility": 0 });
    const expected = bytes.slice();
    expected[officer(0) + 23] = 90;
    expected[officer(2) + 23] = 0;
    expect(result.bytes).toEqual(expected);
    expect(new San3BattleDocument(result.bytes).officer(2).mobility).toBe(0);
    for (const [key, value] of [
      ["battle.3.mobility", 20],
      ["battle.00.mobility", 20],
      ["officer.0.mobility", 20],
      ["battle.0.soldiers", 20],
      ["battle.1.mobility", -1],
      ["battle.1.mobility", 91],
      ["battle.1.mobility", 1.5],
      ["battle.1.mobility", Number.NaN],
    ] as const) {
      expect(() => editSan3Battle(document, { "battle.0.mobility": 90, [key]: value })).toThrow();
      expect(document.copy()).toEqual(bytes);
    }
  });
});
