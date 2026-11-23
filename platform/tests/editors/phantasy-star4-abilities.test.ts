import { expect, it } from "vitest";
import { PhantasyStar4Document } from "../../src/editors/phantasy-star4/document.ts";
import { abilityFields, editFields } from "../../src/editors/phantasy-star4/fields.ts";
import { parsePhantasyStar4Rules } from "../../src/editors/phantasy-star4/rules.ts";
import { phantasyStar4Fixture } from "./phantasy-star4-fixture.ts";
import { phantasyStar4RulesFixture } from "./phantasy-star4-rules-fixture.ts";

const rules = parsePhantasyStar4Rules(phantasyStar4RulesFixture());

it("selects empty ability slots and their capacities atomically in any draft order", () => {
  const document = new PhantasyStar4Document(phantasyStar4Fixture(), rules);
  expect(
    abilityFields(document, 0).find(({ key: fieldId }) => fieldId === "ability.0.maxUses.2"),
  ).toMatchObject({ readonly: false, enabledByField: "ability.0.skill.2" });
  const changes = {
    "ability.0.uses.2": 45,
    "ability.0.maxUses.2": 60,
    "ability.0.skill.2": 4,
    "ability.0.technique.2": 24,
  };
  const result = editFields(document, changes);
  const expected = document.copy();
  expected[0xf554] = 24;
  expected[0xf564] = 4;
  expected.set([45, 60], 0xf56e);
  expect(result.output).toEqual(expected);
  expect(
    editFields(document, Object.fromEntries(Object.entries(changes).reverse())).output,
  ).toEqual(expected);
  const canonical = Object.fromEntries(result.edits.map(({ field, after }) => [field.key, after]));
  expect(editFields(document, canonical).output).toEqual(expected);
});

it("preserves physical holes and preallocated hardware uses when skills are cleared or selected", () => {
  const bytes = phantasyStar4Fixture();
  const base = 0xf500 + 6 * 0x80;
  bytes.set([7, 9], base + 0x74);
  const document = new PhantasyStar4Document(bytes, rules);
  const cleared = editFields(document, { "ability.6.skill.0": 0 });
  expect(cleared.output.slice(base + 0x62, base + 0x6a)).toEqual(
    Uint8Array.of(0, 2, 0, 0, 0, 0, 0, 0),
  );
  expect(cleared.output.slice(base + 0x6a, base + 0x7a)).toEqual(
    bytes.slice(base + 0x6a, base + 0x7a),
  );
  const selected = editFields(document, { "ability.6.skill.5": 17 });
  expect(selected.output.slice(base + 0x74, base + 0x76)).toEqual(Uint8Array.of(7, 9));
  expect(selected.edits).toHaveLength(1);
  expect(() => editFields(document, { "ability.6.maxUses.5": 8 })).toThrow();
});

it("reserves every future natural learning event and permits bounded replacement and removal", () => {
  const document = new PhantasyStar4Document(phantasyStar4Fixture(), rules);
  const techniques = Object.fromEntries(
    Array.from({ length: 13 }, (_, slot) => [`ability.0.technique.${slot}`, slot + 1]),
  );
  expect(
    editFields(document, techniques).output.slice(0xf552, 0xf562).filter(Boolean),
  ).toHaveLength(13);
  expect(() => editFields(document, { ...techniques, "ability.0.technique.13": 14 })).toThrow();
  const skills = Object.fromEntries(
    Array.from({ length: 7 }, (_, slot) => [`ability.0.skill.${slot}`, slot + 1]),
  );
  expect(editFields(document, skills).output.slice(0xf562, 0xf56a).filter(Boolean)).toHaveLength(7);
  expect(() => editFields(document, { ...skills, "ability.0.skill.7": 8 })).toThrow();
  const bytes = phantasyStar4Fixture();
  bytes.set(
    Array.from({ length: 16 }, (_, slot) => slot + 1),
    0xf552,
  );
  const full = new PhantasyStar4Document(bytes, rules);
  expect(editFields(full, { "ability.0.technique.0": 40 }).output[0xf552]).toBe(40);
  expect(editFields(full, { "ability.0.technique.0": 0 }).output[0xf552]).toBe(0);
});

it("reserves Chaz's fixed Megid story slot alongside every remaining natural learning event", () => {
  const rom = phantasyStar4RulesFixture();
  for (let level = 0; level < 14; level++) rom[0x100000 + level * 22 + 12] = 1;
  const bytes = phantasyStar4Fixture();
  bytes[0xf553] = 0;
  const document = new PhantasyStar4Document(bytes, parsePhantasyStar4Rules(rom));
  expect(() => editFields(document, { "ability.0.technique.1": 25 })).toThrow();
  const result = editFields(document, { "ability.0.technique.15": 25 });
  expect(result.output[0xf561]).toBe(25);
  expect(result.edits).toHaveLength(1);
  const occupied = new PhantasyStar4Document(result.output, parsePhantasyStar4Rules(rom));
  expect(() =>
    editFields(occupied, {
      "ability.0.technique.15": 0,
      "ability.0.technique.1": 25,
    }),
  ).toThrow();
});

it("preserves existing duplicates but rejects added duplicates, unknown IDs and disabled counts", () => {
  const bytes = phantasyStar4Fixture();
  bytes[0xf553] = 1;
  const document = new PhantasyStar4Document(bytes, rules);
  expect(editFields(document, { "party.money": 501 }).output.slice(0xf552, 0xf562)).toEqual(
    bytes.slice(0xf552, 0xf562),
  );
  expect(editFields(document, { "ability.0.technique.2": 3 }).output[0xf554]).toBe(3);
  for (const changes of [
    { "ability.0.technique.2": 1 },
    { "ability.0.skill.2": 1 },
    { "ability.0.technique.2": 41 },
    { "ability.0.skill.2": 55 },
    { "ability.0.skill.2": 3, "ability.0.uses.2": 1 },
  ])
    expect(() => editFields(document, changes)).toThrow();
  expect(document.copy()).toEqual(bytes);
});

it("drops disabled count drafts on explicit removal and clamps earlier current drafts on reduction", () => {
  const document = new PhantasyStar4Document(phantasyStar4Fixture(), rules);
  const removed = editFields(document, {
    "ability.0.skill.0": 0,
    "ability.0.uses.0": 45,
    "ability.0.maxUses.0": 60,
  });
  expect(removed.output.slice(0xf56a, 0xf56c)).toEqual(Uint8Array.of(3, 5));
  expect(removed.edits.map(({ field }) => field.key)).toEqual(["ability.0.skill.0"]);
  const reduced = editFields(document, {
    "ability.0.uses.0": 45,
    "ability.0.maxUses.0": 20,
    "person.0.health": 60,
    "person.0.maxHealth": 20,
    "person.0.energy": 30,
    "person.0.maxEnergy": 0,
  });
  const after = new PhantasyStar4Document(reduced.output, rules);
  expect([after.read(0xf56a), after.read(0xf50e, 2), after.read(0xf512, 2)]).toEqual([20, 20, 0]);
  const canonical = Object.fromEntries(reduced.edits.map(({ field, after }) => [field.key, after]));
  expect(editFields(document, canonical).output).toEqual(reduced.output);
});
