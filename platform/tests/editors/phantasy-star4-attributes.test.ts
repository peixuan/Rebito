import { expect, it } from "vitest";
import { PhantasyStar4Document } from "../../src/editors/phantasy-star4/document.ts";
import { characterFields, editFields } from "../../src/editors/phantasy-star4/fields.ts";
import { parsePhantasyStar4Rules } from "../../src/editors/phantasy-star4/rules.ts";
import { phantasyStar4Fixture } from "./phantasy-star4-fixture.ts";
import { phantasyStar4RulesFixture } from "./phantasy-star4-rules-fixture.ts";

const rules = parsePhantasyStar4Rules(phantasyStar4RulesFixture());

it("recomputes equipment totals from signed ROM bonuses without losing clipped contributions", () => {
  const bytes = phantasyStar4Fixture();
  bytes.set([1, 160, 0, 0], 0xf54c);
  bytes.set([81, 82, 83, 84], 0xf526);
  const document = new PhantasyStar4Document(bytes, rules);
  const changes = {
    "person.0.strength": 0,
    "person.0.mental": 255,
    "person.0.agility": 200,
    "person.0.dexterity": 255,
  };
  const result = editFields(document, changes);
  const expected = new Uint8Array(bytes);
  const data = new DataView(expected.buffer);
  expected.set([0, 0], 0xf518);
  expected.set([255, 127], 0xf51b);
  expected.set([200, 255], 0xf51e);
  expected.set([255, 255], 0xf521);
  data.setUint16(0xf524, 65535);
  data.setUint16(0xf528, 327);
  data.setUint16(0xf52c, 158);
  expect(result.output).toEqual(expected);
  expect(document.copy()).toEqual(bytes);
  expect(result.edits.every(({ field }) => Object.hasOwn(changes, field.key))).toBe(true);
  const canonical = Object.fromEntries(result.edits.map(({ field, after }) => [field.key, after]));
  expect(editFields(document, canonical).output).toEqual(expected);
});

it("requires reviewed equipment rules and valid equipment before changing base attributes", () => {
  const bytes = phantasyStar4Fixture();
  expect(
    characterFields(new PhantasyStar4Document(bytes), 0).find(
      ({ columnId }) => columnId === "strength",
    ),
  ).toMatchObject({ readonly: true });
  for (const value of [-1, 256, 1.5, Number.NaN])
    expect(() =>
      editFields(new PhantasyStar4Document(bytes, rules), { "person.0.strength": value }),
    ).toThrow();
  bytes[0xf54c] = 255;
  const document = new PhantasyStar4Document(bytes, rules);
  expect(() => editFields(document, { "party.money": 123, "person.0.strength": 50 })).toThrow();
  expect(editFields(document, { "party.money": 123 }).output[0xf54c]).toBe(255);
  expect(document.copy()).toEqual(bytes);
});

it("does not refresh caches for no-op attribute intents omitted by canonical replay", () => {
  const bytes = phantasyStar4Fixture();
  bytes.set([10, 99], 0xf518);
  const document = new PhantasyStar4Document(bytes, rules);
  const result = editFields(document, { "person.0.strength": 10, "party.money": 501 });
  expect(result.output[0xf519]).toBe(99);
  const canonical = Object.fromEntries(result.edits.map(({ field, after }) => [field.key, after]));
  expect(editFields(document, canonical).output).toEqual(result.output);
});

it("requires field mode for advanced edits and preserves basic editing in other paused modes", () => {
  for (const mode of [0, 4, 8, 16]) {
    const bytes = phantasyStar4Fixture();
    new DataView(bytes.buffer).setUint16(0xef00, mode);
    const document = new PhantasyStar4Document(bytes, rules);
    for (const [key, value] of [
      ["person.0.strength", 10],
      ["person.0.maxHealth", 999],
      ["person.0.maxEnergy", 999],
      ["ability.0.maxUses.0", 255],
      ["ability.0.technique.0", 3],
      ["ability.0.skill.0", 3],
    ] as const)
      expect(() => editFields(document, { [key]: value })).toThrow();
    expect(editFields(document, { "party.money": 999 }).edits).toHaveLength(1);
  }
});

it("allows the reviewed translation's named items without changing the context-free policy", () => {
  for (const id of [27, 118, 123, 140]) {
    const bytes = phantasyStar4Fixture();
    const result = editFields(new PhantasyStar4Document(bytes, rules), { "inventory.0.item": id });
    expect(result.output[0xf410]).toBe(id);
    expect(() =>
      editFields(new PhantasyStar4Document(bytes), { "inventory.0.item": id }),
    ).toThrow();
  }
});
