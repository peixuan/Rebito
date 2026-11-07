import { expect, it } from "vitest";
import { koukaiAdapter } from "../../src/editors/koukai2/adapter.ts";
import { message } from "../../src/shared/messages.ts";
import { editorFixture } from "./fixture.ts";

it("returns a compact UI contract, preserving pending values and omitting binary descriptors", () => {
  const view = koukaiAdapter.view(editorFixture(), { changes: { money: 100 } });
  expect(view.modules).toHaveLength(8);
  expect(view.fields).toHaveLength(14);
  expect(view.preview).toEqual([
    { key: "money", label: message("koukai2.money"), before: 0xa5a5a5a5, after: 100 },
  ]);
  expect(view.fields[0]).toMatchObject({ key: "money", value: 100, max: 600_000_000 });
  for (const field of view.fields)
    for (const privateKey of ["offset", "size", "bias", "mask", "shift"])
      expect(field).not.toHaveProperty(privateKey);
  expect(view.slots[1]).toMatchObject({
    label: message("koukai2.emptySlot", { index: 2 }),
    available: false,
  });
  const persons = koukaiAdapter.view(editorFixture(), { module: "persons", record: "person.0" });
  expect(persons.records).toHaveLength(120);
  expect(persons.records[0]?.cells).toMatchObject({
    "koukai2.skills/koukai2.surveying": message("common.no"),
    "koukai2.skills/koukai2.negotiation": message("common.yes"),
    "koukai2.status/koukai2.nationality": message("koukai2.netherlands"),
  });
  const fleet = koukaiAdapter.view(editorFixture(), { module: "fleet" });
  expect(fleet.records[0]?.available).toBe(false);
  const salary = koukaiAdapter.view(editorFixture(), {
    module: "companions",
    changes: { "companion.0.salary": 123 },
  });
  expect(salary.records[0]?.cells["koukai2.companion/koukai2.salary"]).toBe(1230);
  expect(salary.preview).toContainEqual({
    key: "companion.0.salary",
    label: message("koukai2.salary"),
    before: 1650,
    after: 1230,
  });
});
it("expands actions against pending changes and omits bulk bytes from individual controls", () => {
  const bytes = editorFixture();
  bytes.fill(255, 0x97 + 0x2177, 0x97 + 0x2195);
  const view = koukaiAdapter.view(bytes, {
    module: "sailors",
    record: "person.119",
    action: { id: "person.recruit", record: "person.119" },
  });
  expect(view.records.find((record) => record.id === "person.119")?.summary).toEqual(
    message("koukai2.crewMember"),
  );
  expect(view.changes).toMatchObject({ "companion.0.member": 119, "person.119.port": 255 });
  expect(view.actions.some((action) => action.id === "person.recruit")).toBe(false);
  const map = koukaiAdapter.view(bytes, { module: "discoveries", record: "world.map" });
  expect(map.fields).toEqual([]);
  expect(map.actions).toHaveLength(2);
  const output = koukaiAdapter.apply(bytes, { changes: { money: 1 } });
  expect(output.slice(0x6a1, 0x6a5)).toEqual(Uint8Array.of(1, 0, 0, 0));
});
it("reports unsupported data and invalid editing requests without accepting arbitrary fields", () => {
  expect(() => koukaiAdapter.view(new Uint8Array(), {})).toThrow(
    expect.objectContaining({ code: "invalid_save" }),
  );
  for (const draft of [
    { changes: { money: -1 } },
    { slot: 1 },
    { module: "unknown" },
    { record: "missing" },
    { changes: { unknown: 1 } },
  ])
    expect(() => koukaiAdapter.view(editorFixture(), draft)).toThrow(
      expect.objectContaining({ code: "invalid_edit" }),
    );
  expect(() => koukaiAdapter.apply(editorFixture(), {})).toThrow(
    expect.objectContaining({ code: "no_changes" }),
  );
});
