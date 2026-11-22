import { expect, it } from "vitest";
import { PhantasyStar4Document } from "../../src/editors/phantasy-star4/document.ts";
import {
  abilityFields,
  characterFields,
  editFields,
  inventoryFields,
  partyFields,
} from "../../src/editors/phantasy-star4/fields.ts";
import { phantasyStar4Fixture } from "./phantasy-star4-fixture.ts";

it("describes every character, forty bag slots and bounded learned ability slots", () => {
  const document = new PhantasyStar4Document(phantasyStar4Fixture());
  expect(partyFields(document)[0]?.value).toBe(500);
  expect(
    characterFields(document, 10).find((field) => field.columnId === "experience")?.value,
  ).toBe(2560);
  expect(inventoryFields(document, 39)[0]?.value).toBe(0);
  const abilities = abilityFields(document, 10);
  expect(abilities).toHaveLength(40);
  expect(abilities.filter((field) => !field.readonly)).toHaveLength(2);
  expect(abilities.find((field) => field.key === "ability.10.uses.0")?.max).toBe(5);
  expect(() => inventoryFields(document, 40)).toThrow();
});

it("patches big-endian values while preserving the input and every unrelated RAM byte", () => {
  const bytes = phantasyStar4Fixture();
  const expected = new Uint8Array(bytes);
  const data = new DataView(expected.buffer);
  data.setUint32(0xf438, 9_999_999);
  data.setUint32(0xfa0a, 65536);
  data.setUint16(0xf50e, 60);
  data.setUint16(0xf512, 30);
  expected[0xfa6a] = 5;
  const document = new PhantasyStar4Document(bytes);
  const edited = editFields(document, {
    "party.money": 9_999_999,
    "person.10.experience": 65536,
    "person.0.health": 60,
    "person.0.energy": 30,
    "ability.10.uses.0": 5,
  });
  expect(edited.output).toEqual(expected);
  expect(edited.edits).toHaveLength(5);
  expect(bytes).toEqual(phantasyStar4Fixture());
  expect(document.copy()).toEqual(bytes);
});

it("rejects invalid keys, readonly fields, overflow and impossible HP/TP/skill uses atomically", () => {
  const bytes = phantasyStar4Fixture();
  const document = new PhantasyStar4Document(bytes);
  for (const [key, value] of [
    ["person.0.level", 10],
    ["person.0.maxHealth", 99],
    ["person.0.maxEnergy", 99],
    ["person.0.strength", 90],
    ["person.0.rightHand", 1],
    ["person.0.status", 0],
    ["person.0.health", 61],
    ["person.0.energy", 31],
    ["ability.0.uses.0", 6],
    ["ability.0.uses.7", 0],
    ["ability.0.technique.0", 40],
    ["ability.0.skill.0", 1],
    ["inventory.40.item", 1],
    ["inventory.0.item", 161],
    ["person.11.health", 1],
    ["person.00.health", 1],
    ["party.money", -1],
    ["party.money", 10_000_000],
    ["person.0.experience", Number.NaN],
    ["party.money", 1.5],
    ["unknown", 1],
  ] as const) {
    expect(() => editFields(document, { "person.1.health": 61, [key]: value })).toThrow();
    expect(document.copy()).toEqual(bytes);
  }
});

it("compacts removed items, retains duplicate IDs and returns replayable canonical edits", () => {
  const bytes = phantasyStar4Fixture();
  const document = new PhantasyStar4Document(bytes);
  const result = editFields(document, { "inventory.1.item": 0, "inventory.39.item": 1 });
  expect(new PhantasyStar4Document(result.output).inventory().slice(0, 5)).toEqual([
    1, 1, 160, 1, 0,
  ]);
  const canonical = Object.fromEntries(result.edits.map(({ field, after }) => [field.key, after]));
  expect(editFields(document, canonical).output).toEqual(result.output);
  expect(result.output.slice(0, 0xf410)).toEqual(bytes.slice(0, 0xf410));
  expect(result.output.slice(0xf438)).toEqual(bytes.slice(0xf438));
});

it("returns no edits for no-op drafts and refuses empty or unknown skill slots", () => {
  const bytes = phantasyStar4Fixture();
  bytes[0xf562] = 255;
  const document = new PhantasyStar4Document(bytes);
  expect(editFields(document, { "party.money": 500 }).edits).toEqual([]);
  expect(() => editFields(document, { "ability.0.uses.0": 5 })).toThrow();
  expect(editFields(document, {}).output).toEqual(bytes);
});

it("does not create death-state mismatches or revive characters through an HP scalar", () => {
  const bytes = phantasyStar4Fixture();
  expect(() => editFields(new PhantasyStar4Document(bytes), { "person.0.health": 0 })).toThrow();
  for (const status of [0x04, 0x40, 0x84]) {
    bytes[0xf516] = status;
    new DataView(bytes.buffer).setUint16(0xf50e, 0);
    const document = new PhantasyStar4Document(bytes);
    expect(
      characterFields(document, 0).find((field) => field.columnId === "health")?.readonly,
    ).toBe(true);
    expect(() => editFields(document, { "person.0.health": 60 })).toThrow();
    expect(document.copy()).toEqual(bytes);
  }
});

it("preserves existing unused IDs but cannot add them to inventory", () => {
  for (const unused of [0x1b, 0x76, 0x7b, 0x8c]) {
    const bytes = phantasyStar4Fixture();
    bytes[0xf410] = unused;
    const document = new PhantasyStar4Document(bytes);
    expect(editFields(document, { "inventory.0.item": unused }).output).toEqual(bytes);
    expect(editFields(document, { "party.money": 600 }).output[0xf410]).toBe(unused);
    expect(() => editFields(document, { "inventory.1.item": unused })).toThrow();
    const moved = editFields(document, { "inventory.0.item": 0, "inventory.3.item": unused });
    const replay = Object.fromEntries(moved.edits.map(({ field, after }) => [field.key, after]));
    expect(editFields(document, replay).output).toEqual(moved.output);
  }
});
