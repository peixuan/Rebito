import { expect, it } from "vitest";
import { createPhantasyStar4Adapter } from "../../src/editors/phantasy-star4/adapter.ts";
import { PhantasyStar4Document } from "../../src/editors/phantasy-star4/document.ts";
import { characterFields, editFields } from "../../src/editors/phantasy-star4/fields.ts";
import { parsePhantasyStar4Rules } from "../../src/editors/phantasy-star4/rules.ts";
import { phantasyStar4Fixture } from "./phantasy-star4-fixture.ts";
import { phantasyStar4RulesFixture } from "./phantasy-star4-rules-fixture.ts";

const rules = parsePhantasyStar4Rules(phantasyStar4RulesFixture());
const adapter = createPhantasyStar4Adapter(rules);
const bases = { "person.0.strength": 150, "person.0.agility": 200, "person.0.mental": 200 };

function equipped() {
  const bytes = phantasyStar4Fixture();
  bytes.set([1, 160, 0, 0], 0xf54c);
  return bytes;
}

it("derives combat totals from bases and preserves every unrelated byte", () => {
  const bytes = equipped();
  const before = bytes.slice();
  const expected = bytes.slice();
  expected.set([150, 149], 0xf518);
  expected.set([200, 72], 0xf51b);
  expected.set([200, 255], 0xf51e);
  const view = new DataView(expected.buffer);
  view.setUint16(0xf524, 149);
  view.setUint16(0xf528, 327);
  view.setUint16(0xf52c, 103);
  const result = adapter.view(bytes, { changes: bases });
  expect(adapter.apply(bytes, { changes: bases })).toEqual(expected);
  expect(adapter.apply(bytes, { changes: result.changes })).toEqual(expected);
  expect(bytes).toEqual(before);
  expect(result.changes).toEqual(bases);
  expect(result.preview.map(({ key, before, after }) => [key, before, after])).toEqual(
    expect.arrayContaining([
      ["person.0.strength", 0, 150],
      ["modified.0.strength", 0, 149],
      ["modified.0.agility", 0, 255],
      ["person.0.attack", 0, 149],
      ["person.0.defence", 0, 327],
      ["person.0.magicDefence", 0, 103],
    ]),
  );
  expect(Object.keys(result.changes).some((key) => key.startsWith("modified."))).toBe(false);
  const moved = adapter.view(bytes, {
    changes: result.changes,
    module: "inventory",
    action: { id: "top", record: "1" },
  });
  expect(
    new PhantasyStar4Document(adapter.apply(bytes, { changes: moved.changes })).read(0xf524, 2),
  ).toBe(149);
});

it("exposes read-only totals with their base relation and exact equipment breakdown", () => {
  const view = adapter.view(equipped(), {});
  expect(view.fields.find(({ columnId }) => columnId === "attack")).toMatchObject({
    min: 0,
    max: 65535,
    readonly: true,
    label: { messageId: "phantasyStar4.attack" },
    derivedFrom: { key: "person.0.strength", offset: -1, modulus: 65536 },
    help: {
      messageId: "phantasyStar4.computedHelp",
      parameters: { attributeBonus: -1, combatBonus: 0, total: -1 },
    },
  });
  for (const [stat, attribute, offset] of [
    ["attack", "strength", -1],
    ["defence", "agility", 127],
    ["magicDefence", "mental", -97],
  ] as const) {
    expect(view.fields.find(({ columnId }) => columnId === stat)).toMatchObject({
      readonly: true,
      derivedFrom: { key: `person.0.${attribute}`, offset, modulus: 65536 },
    });
    for (const value of [-1, 0, 200, 65535, 65536, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() =>
        adapter.apply(equipped(), { changes: { [`person.0.${stat}`]: value } }),
      ).toThrow();
  }
});

it("supports multiple characters in any order and rejects even consistent combat intents", () => {
  const bytes = phantasyStar4Fixture();
  const changes = {
    "person.0.strength": 200,
    "person.1.agility": 180,
    "person.1.mental": 160,
  };
  const output = adapter.apply(bytes, { changes });
  expect(
    adapter.apply(bytes, { changes: Object.fromEntries(Object.entries(changes).reverse()) }),
  ).toEqual(output);
  const document = new PhantasyStar4Document(output);
  expect([document.read(0xf518), document.read(0xf59e), document.read(0xf59b)]).toEqual([
    200, 180, 160,
  ]);
  for (const invalid of [
    { "person.0.attack": 200, "person.0.strength": 200 },
    { "person.0.strength": 200, "person.0.attack": 200 },
    { "person.0.strength": -1 },
    { "person.0.strength": 256 },
  ])
    expect(() => adapter.apply(bytes, { changes: invalid })).toThrow();
});

it("preserves stale caches on base no-ops and recalculates actual changes through replay", () => {
  const bytes = phantasyStar4Fixture();
  bytes.set([20, 20], 0xf518);
  const noop = adapter.view(bytes, { changes: { "person.0.strength": 20 } });
  expect(noop.changes).toEqual({});
  expect(noop.preview).toEqual([]);
  expect(
    editFields(new PhantasyStar4Document(bytes, rules), { "person.0.strength": 20 }).output,
  ).toEqual(bytes);
  const result = adapter.view(bytes, { changes: { "person.0.strength": 21 } });
  expect(result.changes).toEqual({ "person.0.strength": 21 });
  expect(adapter.apply(bytes, { changes: result.changes })).toEqual(
    adapter.apply(bytes, { changes: { "person.0.strength": 21 } }),
  );
  expect(
    new PhantasyStar4Document(adapter.apply(bytes, { changes: result.changes })).read(0xf524, 2),
  ).toBe(21);
  expect(() => adapter.apply(bytes, { changes: { "person.0.attack": 20 } })).toThrow();
});

it("rejects unsupported rules, invalid equipment, battle edits and read-only effect keys", () => {
  const bytes = equipped();
  const plain = new PhantasyStar4Document(bytes);
  expect(characterFields(plain, 0).find(({ columnId }) => columnId === "attack")?.readonly).toBe(
    true,
  );
  expect(() => editFields(plain, bases)).toThrow();
  for (const invalid of [
    { "person.11.attack": 10 },
    { "person.00.attack": 10 },
    { "modified.0.strength": 10 },
  ])
    expect(() => adapter.apply(bytes, { changes: invalid })).toThrow();
  bytes[0xf54c] = 255;
  expect(
    adapter.view(bytes, {}).fields.find(({ columnId }) => columnId === "attack")?.readonly,
  ).toBe(true);
  expect(() => adapter.apply(bytes, { changes: bases })).toThrow();
  expect(adapter.view(bytes, { changes: { "party.money": 600 } }).changes).toEqual({
    "party.money": 600,
  });
  bytes[0xf54c] = 1;
  new DataView(bytes.buffer).setUint16(0xef00, 4);
  expect(() => adapter.apply(bytes, { changes: bases })).toThrow("phantasyStar4.fieldModeRequired");
});

it("keeps unachievable and previously wrapped totals intact during unrelated edits", () => {
  const rom = phantasyStar4RulesFixture();
  rom[0x2aa288 + 11] = 0x80;
  rom[0x2aa288 + 15] = 0x80;
  const bytes = phantasyStar4Fixture();
  bytes.set([1, 1, 1, 1], 0xf54c);
  new DataView(bytes.buffer).setUint16(0xf524, 65535);
  const restricted = createPhantasyStar4Adapter(parsePhantasyStar4Rules(rom));
  expect(
    restricted.view(bytes, {}).fields.find(({ columnId }) => columnId === "attack"),
  ).toMatchObject({ readonly: true, value: 65535 });
  expect(() => restricted.apply(bytes, { changes: { "person.0.attack": 0 } })).toThrow();
  const output = restricted.apply(bytes, { changes: { "party.money": 600 } });
  expect(new PhantasyStar4Document(output).read(0xf524, 2)).toBe(65535);
});
