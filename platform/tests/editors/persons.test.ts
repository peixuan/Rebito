import { expect, it } from "vitest";
import { KoukaiDocument } from "../../src/editors/koukai2/document.ts";
import { personNames, portNames } from "../../src/editors/koukai2/names.ts";
import { message } from "../../src/shared/messages.ts";
import { editorFixture } from "./fixture.ts";

it("preserves all unrelated bytes when changing abilities, skill bits and nationality", () => {
  const bytes = editorFixture();
  const person = 0x97 + 0x62c + 119 * 50;
  const document = new KoukaiDocument(bytes);
  expect(personNames).toHaveLength(120);
  expect(portNames).toHaveLength(100);
  expect(document.records(0, "persons")).toHaveLength(120);
  const expected = new Uint8Array(bytes);
  expected.set([255, 0, 50, 100, 200, 254, 1, 2], person + 2);
  expected.set([20, 30, 255, 255, 0, 128, 60, 99], person + 10);
  expected.set([0xba, 0x66], person + 0x16);
  expected[0x97 + 0x5c3 + 5 * 14] = 9;
  const output = document.render(0, {
    "person.119.leadership": 255,
    "person.119.navigation": 0,
    "person.119.knowledge": 50,
    "person.119.intuition": 100,
    "person.119.courage": 200,
    "person.119.swordsmanship": 254,
    "person.119.charm": 1,
    "person.119.luck": 2,
    "person.119.navigation_level": 20,
    "person.119.battle_level": 30,
    "person.119.navigation_experience": 65535,
    "person.119.battle_experience": 32768,
    "person.119.age": 60,
    "person.119.loyalty": 99,
    "person.119.surveying": 1,
    "person.119.cartography": 1,
    "person.119.gunnery": 0,
    "person.119.accounting": 1,
    "person.119.negotiation": 0,
    "person.119.country": 6,
    "person.5.title": 9,
  });
  expect(output).toEqual(expected);
  expect(() => document.render(0, { "person.119.country": 7 })).toThrow();
  expect(() => document.render(0, { "person.119.port": 100 })).toThrow();
  expect(() => document.render(0, { "person.6.title": 1 })).toThrow("koukai2.unknownField");
});

it("uses legacy labels and membership independently of stale affiliation status", () => {
  const bytes = editorFixture();
  bytes[0x97 + 0x2177] = 60;
  const status = 0x97 + 0x62c + 60 * 50 + 0x12;
  for (const [marker, label] of [
    [0xba, message("koukai2.rudolph")],
    [0xe4, message("koukai2.robertus")],
  ] as const) {
    bytes[0x97 + 0x11cb] = marker;
    for (const [value, summary] of [
      [255, message("koukai2.unemployed")],
      [254, message("koukai2.hidden")],
      [0, message("koukai2.crewMember")],
    ] as const) {
      bytes[status] = value;
      const record = new KoukaiDocument(bytes).records(0, "persons")[60];
      expect(record).toMatchObject({ label, summary, tags: ["companion"] });
    }
  }
  expect(new KoukaiDocument(editorFixture()).records(0, "persons")[119]).toMatchObject({
    label: message("koukai2.personNames.119"),
    summary: message("koukai2.captain"),
    tags: [],
  });
});
