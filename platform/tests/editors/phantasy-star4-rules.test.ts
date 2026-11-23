import { expect, it } from "vitest";
import {
  parsePhantasyStar4Rules,
  phantasyStar4RomLimit,
} from "../../src/editors/phantasy-star4/rules.ts";
import { phantasyStar4RulesFixture as fixture } from "./phantasy-star4-rules-fixture.ts";

it("extracts signed equipment bonuses and exact future level-learning counts", () => {
  const rules = parsePhantasyStar4Rules(fixture());
  expect(rules?.equipment).toHaveLength(161);
  expect(rules?.equipment[0]).toEqual({
    strength: 0,
    mental: 0,
    agility: 0,
    dexterity: 0,
    attack: 0,
    defence: 0,
    magicDefence: 0,
  });
  expect(rules?.equipment[1]).toMatchObject({ strength: -1, mental: -128, agility: 127 });
  expect(rules?.equipment[160]?.magicDefence).toBe(31);
  expect(rules?.remainingLearning(0, 1)).toEqual({ techniques: 2, skills: 1 });
  expect(rules?.remainingLearning(0, 2)).toEqual({ techniques: 1, skills: 1 });
  expect(rules?.remainingLearning(0, 98)).toEqual({ techniques: 0, skills: 1 });
  expect(rules?.remainingLearning(0, 99)).toEqual({ techniques: 0, skills: 0 });
  for (const [character, level] of [
    [0, 0],
    [0, 100],
    [11, 7],
    [0.5, 7],
    [0, 7.5],
  ] as const)
    expect(() => rules?.remainingLearning(character, level)).toThrow();
});

it("owns extracted rules independently of mutable and offset input buffers", () => {
  const bytes = fixture();
  const padded = new Uint8Array(bytes.length + 20);
  padded.set(bytes, 10);
  const rules = parsePhantasyStar4Rules(padded.subarray(10, -10));
  padded.fill(0);
  expect(rules?.equipment[1]?.strength).toBe(-1);
  expect(rules?.remainingLearning(0, 1)).toEqual({ techniques: 2, skills: 1 });
});

it("disables unsupported headers, table references and malformed growth records", () => {
  expect(parsePhantasyStar4Rules(new Uint8Array(32))).toBeUndefined();
  expect(parsePhantasyStar4Rules(new Uint8Array(phantasyStar4RomLimit + 1))).toBeUndefined();
  const corruptions = [
    (data: DataView) => data.setUint8(0x160, 0),
    (data: DataView) => data.setUint32(0x5f87a, 0x2aa290),
    (data: DataView) => data.setInt16(0x3e5e, 0),
    (data: DataView) => data.setUint16(0x3f8e, 0),
    (data: DataView) => data.setUint32(0x3f90, 0xfffffffe),
    (data: DataView) => data.setUint32(0x3f96, 0x100000),
    (data: DataView) => data.setUint32(0x100000, 10_000_000),
    (data: DataView) => data.setUint32(0x100000 + 22, 1),
    (data: DataView) => data.setUint16(0x100000 + 4, 0),
    (data: DataView) => data.setUint16(0x100000 + 6, 0x8000),
    (data: DataView) => data.setUint8(0x100000 + 12, 41),
    (data: DataView) => data.setUint8(0x100000 + 13, 55),
    (data: DataView) => {
      for (let index = 0; index < 17; index++) data.setUint8(0x100000 + index * 22 + 12, 1);
    },
  ];
  for (const corrupt of corruptions) {
    const bytes = fixture();
    corrupt(new DataView(bytes.buffer));
    expect(parsePhantasyStar4Rules(bytes)).toBeUndefined();
  }
});
