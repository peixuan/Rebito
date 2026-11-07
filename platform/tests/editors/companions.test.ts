import { expect, it } from "vitest";
import { KoukaiDocument } from "../../src/editors/koukai2/document.ts";
import { message } from "../../src/shared/messages.ts";
import { editorFixture } from "./fixture.ts";

const base = 0x97;
const roster = base + 0x2177;
const person = base + 0x62c + 119 * 50;
function fixture(hero = 0) {
  const bytes = editorFixture(hero);
  bytes.fill(255, roster, roster + 30);
  return bytes;
}
it("recruits into the first empty position and preserves salary and loyalty for every hero", () => {
  for (const [hero, fleet] of [0, 10, 30, 50, 40, 20].entries()) {
    const bytes = fixture(hero);
    bytes[roster] = 50;
    const document = new KoukaiDocument(bytes);
    expect(document.records(0, "companions")).toHaveLength(30);
    expect(document.records(0, "sailors")).toHaveLength(119);
    expect(document.records(0, "sailors").some((record) => record.id === `person.${hero}`)).toBe(
      false,
    );
    const expected = new Uint8Array(bytes);
    expected[roster + 1] = 119;
    expected.set([fleet, 255, 6], person + 0x12);
    const result = document.render(0, document.action(0, "person.recruit", "person.119"));
    expect(result).toEqual(expected);
    expect(() => new KoukaiDocument(result).action(0, "person.recruit", "person.119")).toThrow(
      "koukai2.alreadyRecruited",
    );
  }
});
it("dismisses or hides a companion, applying a pending destination before the action", () => {
  const bytes = fixture();
  bytes[roster] = 119;
  bytes[roster + 1] = 119; // Legacy duplicate behavior is deliberate.
  const document = new KoukaiDocument(bytes);
  expect(() => document.action(0, "person.dismiss", "person.119")).toThrow(
    "koukai2.selectDismissalPort",
  );
  for (const action of ["person.dismiss", "person.hide"]) {
    const expected = new Uint8Array(bytes);
    expected[roster] = 255;
    expected.set(action === "person.dismiss" ? [255, 99, 0] : [254, 0, 0], person + 0x12);
    expect(
      document.render(0, document.action(0, action, "person.119", { "person.119.port": 99 })),
    ).toEqual(expected);
  }
  const hidden = new KoukaiDocument(
    document.render(0, document.action(0, "person.hide", "person.118")),
  );
  expect(
    hidden.records(0, "sailors").find((record) => record.id === "person.118")?.actions,
  ).not.toContainEqual(expect.objectContaining({ id: "person.hide" }));
});
it("copies pending salary and loyalty only to valid roster members", () => {
  const bytes = fixture();
  bytes.set([119, 50, 200, 255], roster);
  const document = new KoukaiDocument(bytes);
  const expected = new Uint8Array(bytes);
  expected.set([30, 30], base + 0x2195);
  expected[person + 0x11] = 255;
  expected[base + 0x62c + 50 * 50 + 0x11] = 255;
  const changes = document.action(0, "companions.apply_all", "companion.0", {
    "companion.0.salary": 30,
    "person.119.loyalty": 255,
  });
  expect(document.render(0, changes)).toEqual(expected);
  expect(() => document.action(0, "companions.apply_all", "companion.2")).toThrow(
    "koukai2.selectCompanion",
  );
  expect(document.records(0, "companions")[2]?.summary).toEqual(message("koukai2.invalidPerson"));
});
it("rejects malformed records, a full roster, the protagonist and unknown actions", () => {
  const bytes = fixture();
  bytes.fill(50, roster, roster + 30);
  const document = new KoukaiDocument(bytes);
  expect(() => document.action(0, "person.recruit", "person.119")).toThrow("koukai2.rosterFull");
  expect(() => document.action(0, "person.hide", "person.0")).toThrow("koukai2.heroAffiliation");
  expect(() => document.action(0, "invalid", "person.119")).toThrow("koukai2.unknownPersonAction");
  for (const record of ["person.-1", "person.120", "person.01", "person.", "person.1e1", "wrong.1"])
    expect(() => document.action(0, "person.hide", record)).toThrow("editor.selectRecord");
});
