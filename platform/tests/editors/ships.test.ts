import { expect, it } from "vitest";
import { KoukaiDocument } from "../../src/editors/koukai2/document.ts";
import { editorFixture } from "./fixture.ts";

it("writes all 17 fleet fields in the last slot without touching adjacent data", () => {
  const bytes = editorFixture(5, 9);
  const base = 0x97 + 9 * 0x8074;
  const state = base + 0x21fd + 133 * 20;
  const supplies = base + 0x4630;
  bytes[state + 7] = 39;
  const ship = base + 0x4bfd + 39 * 22;
  const document = new KoukaiDocument(bytes);
  expect(document.records(9, "fleet")[0]?.fields).toHaveLength(17);
  const output = document.render(9, {
    "fleet.2.0.crew": 3000,
    "fleet.2.0.durability": 200,
    "fleet.2.0.max_durability": 255,
    "fleet.2.0.propulsion": 10,
    "fleet.2.0.turning": 20,
    "fleet.2.0.cannon_count": 40,
    "fleet.2.0.cannon_type": 7,
    "fleet_supply.0.status": 250,
    "fleet_supply.0.figurehead": 10,
    "fleet_supply.0.water": 32760,
    "fleet_supply.0.food": 1234,
    "fleet_supply.0.ammo": 65535,
    "fleet_supply.0.materials": 1,
    "ship.39.type": 24,
    "ship.39.allocated_cannons": 200,
    "ship.39.allocated_crew": 65535,
    "ship.39.allocated_cargo": 12345,
  });
  const expected = new Uint8Array(bytes);
  expected.set([184, 11, 200, 255, 10, 20, 40, 39, 23], state);
  expected.set([248, 127, 210, 4, 255, 255, 1, 0], supplies);
  expected.set([250, 10], supplies + 28);
  expected[ship] = 24;
  expected.set([200, 255, 255, 57, 48], ship + 2);
  expect(output).toEqual(expected);
});
it("writes twelve template fields with exact offsets and storage units", () => {
  const bytes = editorFixture();
  const document = new KoukaiDocument(bytes);
  expect(document.records(0, "ship_types")).toHaveLength(25);
  expect(document.records(0, "ship_types").every((record) => record.fields.length === 12)).toBe(
    true,
  );
  const output = document.render(0, {
    "ship_type.24.min_industry": 255,
    "ship_type.24.durability": 200,
    "ship_type.24.propulsion": 1,
    "ship_type.24.turning": 2,
    "ship_type.24.max_crew": 3,
    "ship_type.24.required_crew": 4,
    "ship_type.24.capacity": 65535,
    "ship_type.24.max_cannons": 255,
    "ship_type.24.price": 32767,
    "ship_type.24.default_cannons": 99,
    "ship_type.24.default_crew": 1000,
    "ship_type.24.default_cargo": 12345,
  });
  const expected = new Uint8Array(bytes);
  const stats = 0x97 + 0x5184 + 24 * 12;
  expected.set([255, 200, 1, 2, 3, 4, 255, 255, 255], stats);
  expected.set([255, 127], stats + 10);
  expected.set([99, 232, 3, 57, 48], 0x97 + 0x4f5e + 24 * 22 + 17);
  expect(output).toEqual(expected);
  expect(() => document.render(0, { "ship_type.24.price": 32768 })).toThrow();
});
it("resolves all 65 physical references and template aliases for all six heroes", () => {
  for (const [hero, owner] of [0, 1, 3, 5, 4, 2].entries()) {
    for (let physical = 0; physical <= 64; physical++) {
      const bytes = editorFixture(hero);
      const state = 0x97 + 0x21fd + 133 * owner * 10;
      bytes[state + 7] = physical;
      bytes[state + 16] = physical;
      const document = new KoukaiDocument(bytes);
      const records = document.records(0, "fleet");
      expect(records[0]?.fields).toHaveLength(17);
      expect(records[1]?.fields).toHaveLength(13);
      const field = records[0]?.fields.at(-1);
      expect(field?.offset).toBe(0x97 + 0x4bfd + physical * 22 + 5);
      if (physical >= 40) {
        expect(field?.key).toBe(`ship_type.${physical - 40}.default_cargo`);
        expect(document.fields(0).get(field?.key ?? "")?.offset).toBe(field?.offset);
      }
    }
  }
});
it("isolates empty and unknown ship references", () => {
  const bytes = editorFixture();
  const state = 0x97 + 0x21fd;
  for (const id of [65, 254, 255]) {
    bytes[state + 7] = id;
    expect(new KoukaiDocument(bytes).records(0, "fleet")[0]).toMatchObject({
      fields: [],
      available: false,
    });
  }
  bytes[state + 7] = 0;
  bytes[0x97 + 0x4bfd] = 255;
  expect(new KoukaiDocument(bytes).records(0, "fleet")[0]?.available).toBe(false);
});
