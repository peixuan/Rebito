import { expect, it } from "vitest";
import { PhantasyStar4Document } from "../../src/editors/phantasy-star4/document.ts";
import {
  abilityFields,
  characterFields,
  editFields,
} from "../../src/editors/phantasy-star4/fields.ts";
import { phantasyStar4Fixture } from "./phantasy-star4-fixture.ts";

it("exposes capacity dependencies and applies larger maxima with current values atomically", () => {
  const document = new PhantasyStar4Document(phantasyStar4Fixture());
  expect(characterFields(document, 0).find(({ columnId }) => columnId === "health")).toMatchObject({
    maximumField: "person.0.maxHealth",
  });
  expect(abilityFields(document, 0).find(({ key }) => key === "ability.0.uses.0")).toMatchObject({
    maximumField: "ability.0.maxUses.0",
    enabledByField: "ability.0.skill.0",
  });
  const changes = {
    "person.0.health": 123,
    "person.0.maxHealth": 150,
    "person.0.energy": 234,
    "person.0.maxEnergy": 250,
    "ability.0.uses.0": 99,
    "ability.0.maxUses.0": 99,
  };
  const result = editFields(document, changes);
  const after = new PhantasyStar4Document(result.output);
  expect([after.read(0xf50e, 2), after.read(0xf510, 2)]).toEqual([123, 150]);
  expect([after.read(0xf512, 2), after.read(0xf514, 2)]).toEqual([234, 250]);
  expect([after.read(0xf56a), after.read(0xf56b)]).toEqual([99, 99]);
  expect(
    editFields(document, Object.fromEntries(Object.entries(changes).reverse())).output,
  ).toEqual(result.output);
});

it("clamps current values when capacities fall and includes linked changes in replay", () => {
  const bytes = phantasyStar4Fixture();
  const document = new PhantasyStar4Document(bytes);
  const result = editFields(document, {
    "person.0.maxHealth": 10,
    "person.0.maxEnergy": 0,
    "ability.0.maxUses.0": 1,
  });
  const canonical = Object.fromEntries(result.edits.map(({ field, after }) => [field.key, after]));
  expect(canonical).toEqual({
    "person.0.maxHealth": 10,
    "person.0.health": 10,
    "person.0.maxEnergy": 0,
    "person.0.energy": 0,
    "ability.0.maxUses.0": 1,
    "ability.0.uses.0": 1,
  });
  expect(editFields(document, canonical).output).toEqual(result.output);
  const expected = new Uint8Array(bytes);
  const data = new DataView(expected.buffer);
  data.setUint16(0xf50e, 10);
  data.setUint16(0xf510, 10);
  data.setUint16(0xf512, 0);
  data.setUint16(0xf514, 0);
  expected.set([1, 1], 0xf56a);
  expect(result.output).toEqual(expected);
  expect(document.copy()).toEqual(bytes);
});

it("does not heal dead characters or refill resources when only maxima increase", () => {
  const bytes = phantasyStar4Fixture();
  bytes[0xf516] = 4;
  new DataView(bytes.buffer).setUint16(0xf50e, 0);
  const document = new PhantasyStar4Document(bytes);
  const result = editFields(document, {
    "person.0.maxHealth": 100,
    "person.0.maxEnergy": 100,
    "ability.0.maxUses.0": 10,
  });
  const after = new PhantasyStar4Document(result.output);
  expect([after.read(0xf50e, 2), after.read(0xf512, 2), after.read(0xf56a)]).toEqual([0, 20, 3]);
  expect(after.read(0xf516)).toBe(4);
  expect(result.edits).toHaveLength(3);
});

it("does not implicitly write readonly HP in an inconsistent pre-existing death state", () => {
  const bytes = phantasyStar4Fixture();
  bytes[0xf516] = 4;
  const document = new PhantasyStar4Document(bytes);
  expect(() => editFields(document, { "person.0.maxHealth": 10 })).toThrow();
  expect(editFields(document, { "person.0.maxHealth": 100 }).output[0xf50f]).toBe(40);
});

it("rejects impossible capacity drafts without applying any partial write", () => {
  const document = new PhantasyStar4Document(phantasyStar4Fixture());
  for (const changes of [
    { "person.0.maxHealth": 0 },
    { "person.0.maxHealth": 1000 },
    { "person.0.maxEnergy": -1 },
    { "person.0.maxEnergy": 1000 },
    { "person.0.maxHealth": 10, "person.0.health": 32768 },
    { "person.0.maxEnergy": 0, "person.0.energy": 32768 },
    { "ability.0.maxUses.0": 256 },
    { "ability.0.maxUses.0": 100 },
    { "ability.0.maxUses.0": 2, "ability.0.uses.0": 256 },
    { "ability.0.maxUses.7": 1 },
  ])
    expect(() => editFields(document, { "party.money": 999, ...changes })).toThrow();
  expect(document.copy()).toEqual(phantasyStar4Fixture());
});

it("preserves pre-existing points above the supported editing range until explicitly reduced", () => {
  const bytes = phantasyStar4Fixture();
  const data = new DataView(bytes.buffer);
  data.setUint16(0xf50e, 1200);
  data.setUint16(0xf510, 1500);
  bytes.set([200, 255], 0xf56a);
  const document = new PhantasyStar4Document(bytes);
  expect(editFields(document, { "party.money": 501 }).output.slice(0xf50e, 0xf512)).toEqual(
    bytes.slice(0xf50e, 0xf512),
  );
  expect(editFields(document, { "party.money": 501 }).output.slice(0xf56a, 0xf56c)).toEqual(
    Uint8Array.of(200, 255),
  );
  expect(editFields(document, { "ability.0.maxUses.0": 99 }).output.slice(0xf56a, 0xf56c)).toEqual(
    Uint8Array.of(99, 99),
  );
  const reduced = new PhantasyStar4Document(
    editFields(document, { "person.0.maxHealth": 999 }).output,
  );
  expect([reduced.read(0xf50e, 2), reduced.read(0xf510, 2)]).toEqual([999, 999]);
});
