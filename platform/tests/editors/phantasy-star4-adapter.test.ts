import { expect, it } from "vitest";
import { phantasyStar4Adapter as adapter } from "../../src/editors/phantasy-star4/adapter.ts";
import { PhantasyStar4Document } from "../../src/editors/phantasy-star4/document.ts";
import { phantasyStar4Fixture } from "./phantasy-star4-fixture.ts";

it("presents characters, named inventory and ability slots without leaking binary offsets", () => {
  const bytes = phantasyStar4Fixture();
  const characters = adapter.view(bytes, {});
  expect(characters.selected).toBe("0");
  expect(characters.records).toHaveLength(11);
  expect(characters.fields.every((field) => !("offset" in field) && !("width" in field))).toBe(
    true,
  );
  expect(
    characters.columns.filter(({ defaultVisible }) => defaultVisible).map(({ id }) => id),
  ).toEqual(["level", "health", "energy"]);
  const inventory = adapter.view(bytes, { module: "inventory" });
  expect(inventory.filter).toMatchObject({ tag: "owned", defaultEnabled: true });
  expect(inventory.records.filter(({ tags }) => tags.includes("owned"))).toHaveLength(4);
  expect(inventory.fields[0]?.choices).toHaveLength(161);
  expect(adapter.view(bytes, { module: "abilities" }).fields).toHaveLength(40);
  expect(adapter.view(bytes, { module: "party" }).records).toHaveLength(1);
});

it("previews and replays combined resource, character, skill and inventory drafts", () => {
  const bytes = phantasyStar4Fixture();
  const changes = {
    "party.money": 3210,
    "person.0.health": 30,
    "ability.0.uses.0": 5,
    "inventory.0.item": 125,
  };
  const preview = adapter.view(bytes, { changes });
  expect(preview.preview).toHaveLength(4);
  expect(preview.changes).toEqual(changes);
  const edited = adapter.apply(bytes, { changes: preview.changes });
  const document = new PhantasyStar4Document(edited);
  expect(document.read(0xf438, 4)).toBe(3210);
  expect(document.inventory()[0]).toBe(125);
  expect(bytes).toEqual(phantasyStar4Fixture());
});

it("moves actual inventory positions, composes pending edits and replays canonical drafts", () => {
  const bytes = phantasyStar4Fixture();
  for (const [id, record, expected] of [
    ["top", "3", [160, 1, 2, 1]],
    ["up", "2", [1, 1, 2, 160]],
    ["down", "1", [1, 1, 2, 160]],
  ] as const) {
    const view = adapter.view(bytes, {
      module: "inventory",
      action: { id, record },
      changes: { "party.money": 999 },
    });
    const edited = adapter.apply(bytes, { changes: view.changes });
    const document = new PhantasyStar4Document(edited);
    expect(document.inventory().slice(0, 4)).toEqual(expected);
    expect(document.read(0xf438, 4)).toBe(999);
  }
});

it("keeps occupied physical slots visible across gaps and moves their actual items", () => {
  const bytes = phantasyStar4Fixture();
  bytes.fill(0, 0xf410, 0xf438);
  bytes[0xf410] = 125;
  bytes[0xf412] = 126;
  bytes[0xf437] = 127;
  const before = new Uint8Array(bytes);
  const view = adapter.view(bytes, { module: "inventory", record: "2" });
  expect(view.records.filter(({ tags }) => tags.includes("owned")).map(({ id }) => id)).toEqual([
    "0",
    "2",
    "39",
  ]);
  expect(view.actions.map(({ id }) => id)).toEqual(["top", "up", "down"]);
  expect(view.changes).toEqual({});
  expect(adapter.view(bytes, { module: "inventory", record: "1" }).actions).toEqual([]);
  for (const [id, record, expected] of [
    ["top", "39", [127, 125, 126]],
    ["up", "2", [126, 125, 127]],
    ["down", "2", [125, 127, 126]],
  ] as const) {
    const moved = adapter.view(bytes, {
      module: "inventory",
      action: { id, record },
      changes: { "party.money": 999 },
    });
    const replay = new PhantasyStar4Document(adapter.apply(bytes, { changes: moved.changes }));
    expect(replay.inventory()).toEqual([...expected, ...Array<number>(37).fill(0)]);
    expect(replay.read(0xf438, 4)).toBe(999);
  }
  const pending = adapter.view(bytes, { changes: { "inventory.0.item": 128 } });
  const composed = adapter.view(bytes, {
    module: "inventory",
    changes: pending.changes,
    action: { id: "top", record: "2" },
  });
  expect(
    new PhantasyStar4Document(adapter.apply(bytes, { changes: composed.changes }))
      .inventory()
      .slice(0, 3),
  ).toEqual([127, 128, 126]);
  expect(() =>
    adapter.view(bytes, { module: "inventory", action: { id: "top", record: "1" } }),
  ).toThrow();
  expect(bytes).toEqual(before);
});

it("rejects invalid selections, actions, readonly writes and empty publications", () => {
  const bytes = phantasyStar4Fixture();
  for (const draft of [
    { slot: 1 },
    { module: "other" },
    { record: "11" },
    { record: "01" },
    { module: "party", record: "1" },
    { action: { id: "top", record: "1" } },
    { module: "inventory", action: { id: "top", record: "0" } },
    { module: "inventory", action: { id: "down", record: "3" } },
    { module: "inventory", action: { id: "other", record: "1" } },
    { changes: { "person.0.level": 99 } },
  ])
    expect(() => adapter.view(bytes, draft)).toThrow();
  expect(() => adapter.apply(bytes, {})).toThrow("editor.noChanges");
});
