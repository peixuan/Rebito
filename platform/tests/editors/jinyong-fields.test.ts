import { expect, it } from "vitest";
import { JinyongDocument } from "../../src/editors/jinyong/document.ts";
import {
  editCharacters,
  findCharacterField,
  personFields,
  skillFields,
} from "../../src/editors/jinyong/fields.ts";
import { jinyongFixture } from "./jinyong-fixture.ts";

it("writes independently specified original DOS offsets and preserves every other byte", () => {
  const source = jinyongFixture();
  const expected = new Uint8Array(source);
  const bytes = new DataView(expected.buffer);
  bytes.setInt16(0x366, 99, true);
  bytes.setInt16(0x368, 999, true);
  bytes.setInt16(0x3bc, 100, true);
  bytes.setInt16(0x3c2, 1, true);
  bytes.setInt16(0x3d6, 999, true);
  bytes.setUint16(0x364, 65_000, true);
  bytes.setInt16(836 + 319 * 182 + 86, 100, true);
  const result = editCharacters(new JinyongDocument(source), {
    "person.0.health": 99,
    "person.0.maxHealth": 999,
    "person.0.aptitude": 100,
    "skill.0.0.id": 1,
    "skill.0.0.proficiency": 999,
    "person.0.experience": 65_000,
    "person.319.attack": 100,
  });
  expect(result.output).toEqual(expected);
  expect(source).toEqual(jinyongFixture());
  expect(result.edits).toHaveLength(7);
  expect(findCharacterField(new JinyongDocument(result.output), "person.0.experience").value).toBe(
    65_000,
  );
});

it("does not normalize untouched unusual values or report unchanged fields", () => {
  const original = new JinyongDocument(jinyongFixture());
  expect(editCharacters(original, {}).output).toEqual(original.copy());
  expect(editCharacters(original, { "person.0.health": 32 }).edits).toEqual([]);
  expect(personFields(original, 0).find((field) => field.columnId === "dualAttack")?.boolean).toBe(
    true,
  );
  expect(
    personFields(original, 0).find((f) => f.key === "person.0.energyType")?.choices,
  ).toHaveLength(3);
  expect(skillFields(original, 0)).toHaveLength(20);
});

it("rejects unknown, remade and out-of-bounds fields without partially applying a batch", () => {
  const document = new JinyongDocument(jinyongFixture());
  for (const key of [
    "person.320.health",
    "person.00.health",
    "person.-1.health",
    "person.0.gongti",
    "skill.0.10.id",
    "skill.0.0.offset",
    "constructor",
  ]) {
    expect(() => editCharacters(document, { "person.0.health": 99, [key]: 1 })).toThrow();
    expect(document.copy()).toEqual(jinyongFixture());
  }
});

it("rejects fractional, non-finite and unsupported attribute or skill values", () => {
  const document = new JinyongDocument(jinyongFixture());
  for (const [key, value] of [
    ["person.0.health", -1],
    ["person.0.health", 1000],
    ["person.0.level", 0],
    ["person.0.dualAttack", 2],
    ["person.0.energyType", 3],
    ["person.0.experience", 65_536],
    ["skill.0.0.id", 93],
    ["skill.0.0.proficiency", 1000],
    ["person.0.health", 1.5],
    ["person.0.health", Number.NaN],
    ["person.0.health", Infinity],
  ] as const)
    expect(() => editCharacters(document, { [key]: value })).toThrow();
});
