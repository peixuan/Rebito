import { expect, it } from "vitest";
import { jinyongAdapter as adapter } from "../../src/editors/jinyong/adapter.ts";
import { findEditor, listEditors } from "../../src/editors/registry.ts";
import { message } from "../../src/shared/messages.ts";
import { jinyongFixture } from "./jinyong-fixture.ts";

it("registers an original-only DOS editor and excludes resource and world files", () => {
  expect(findEditor("jinyong")?.adapter).toBe(adapter);
  expect(listEditors().find(({ id }) => id === "jinyong")).toMatchObject({
    system: "dos",
    label: message("editor.jinyongTitle"),
  });
  for (const name of ["R1.GRP", "r2.grp", "JY/R3.GRP"])
    expect(adapter.acceptsFile?.(name)).toBe(true);
  for (const name of ["RANGER.GRP", "S1.GRP", "D1.GRP", "R1.IDX", "R4.GRP", "OTHER1.GRP"])
    expect(adapter.acceptsFile?.(name)).toBe(false);
});

it("provides sortable character values and public fields without binary offsets", () => {
  const view = adapter.view(jinyongFixture(), {});
  expect(view.records).toHaveLength(320);
  expect(view.records[0]).toMatchObject({ id: "0", label: "Test0", cells: { health: 32 } });
  expect(view.records[0]?.summary).toEqual(message("jinyong.partyMember"));
  expect(view.records[1]?.summary).toBe("");
  expect(view.fields).toHaveLength(29);
  expect(view.fields.every((field) => !("offset" in field) && !("unsigned" in field))).toBe(true);
  expect(view.modules.map(({ id }) => id)).toEqual(["characters", "skills", "inventory"]);
  expect(view.preview).toEqual([]);
});

it("previews and writes mixed modules against one original without mutating it", () => {
  const bytes = jinyongFixture();
  const before = bytes.slice();
  const changes = {
    "person.0.health": 88,
    "person.0.dualAttack": 1,
    "skill.0.0.id": 92,
    "skill.0.0.proficiency": 999,
    "inventory.174.quantity": 2500,
  };
  const view = adapter.view(bytes, { module: "skills", changes });
  expect(view.fields.find(({ key }) => key === "skill.0.0.id")?.value).toBe(92);
  expect(view.records[0]?.cells.learned).toBe(1);
  expect(view.preview).toHaveLength(5);
  expect(view.preview.find(({ key }) => key === "skill.0.0.id")?.after).toBe("Test92");
  expect(view.preview.find(({ key: fieldId }) => fieldId === "person.0.dualAttack")?.after).toEqual(
    message("common.yes"),
  );
  const output = adapter.apply(bytes, { changes });
  const data = new DataView(output.buffer);
  expect(data.getInt16(0x366, true)).toBe(88);
  expect(data.getInt16(0x3c2, true)).toBe(92);
  expect(data.getInt16(38, true)).toBe(2500);
  expect(bytes).toEqual(before);
  expect(adapter.view(output, { module: "inventory" }).selected).toBe("174");
  expect(adapter.view(output, { module: "inventory" }).fields[0]?.value).toBe(2500);
});

it("renders unknown original values and unnamed records without normalizing them", () => {
  const bytes = jinyongFixture();
  bytes.fill(0, 844, 854);
  expect(adapter.view(bytes, {}).records[0]?.label).toEqual(
    message("jinyong.record", { index: 0 }),
  );
  expect(adapter.view(bytes, {}).records[0]?.cells.energyType).toEqual(
    message("editor.unknownValue", { value: -23131 }),
  );
  expect(adapter.view(bytes, { module: "inventory", record: "199" }).fields[0]?.value).toBe(0);
  expect(adapter.view(bytes, { module: "skills", record: "319" }).fields).toHaveLength(20);
});

it("rejects invalid selections, unsupported actions, MOD fields and empty edits", () => {
  const bytes = jinyongFixture();
  for (const draft of [
    { slot: 1 },
    { module: "world" },
    { record: "320" },
    { record: "01" },
    { module: "inventory", record: "200" },
    { action: { id: "max", record: "0" } },
    { changes: { "person.0.neigong": 1 } },
    { changes: { "inventory.0.quantity": -1 } },
  ])
    expect(() => adapter.view(bytes, draft)).toThrow();
  expect(() => adapter.apply(bytes, {})).toThrow("editor.noChanges");
  expect(() => adapter.apply(bytes, { changes: { "person.0.health": 32 } })).toThrow(
    "editor.noChanges",
  );
  expect(() => adapter.view(new Uint8Array(114242), {})).toThrow("editor.invalidSave");
});

it("shows owned items in native order and replays moves across modules", () => {
  const bytes = adapter.apply(jinyongFixture(), {
    changes: { "inventory.1.quantity": 3, "inventory.199.quantity": 8 },
  });
  const view = adapter.view(bytes, { module: "inventory", record: "199" });
  expect(view.filter).toEqual({
    tag: "owned",
    label: message("jinyong.ownedOnly"),
    defaultEnabled: true,
  });
  expect(view.columns.every(({ defaultVisible }) => defaultVisible)).toBe(true);
  expect(view.records.filter(({ tags }) => tags.includes("owned")).map(({ id }) => id)).toEqual([
    "174",
    "1",
    "199",
  ]);
  expect(view.fields[1]).toMatchObject({ value: 3, min: 1, max: 3, readonly: false });
  expect(view.actions.map(({ id }) => id)).toEqual(["top", "up"]);
  const moved = adapter.view(bytes, {
    module: "inventory",
    record: "199",
    action: { id: "top", record: "199" },
  });
  expect(moved.records.slice(0, 3).map(({ id }) => id)).toEqual(["199", "174", "1"]);
  expect(moved.actions.map(({ id }) => id)).toEqual(["down", "bottom"]);
  expect(moved.preview[0]).toMatchObject({
    label: message("jinyong.bagSlot", { index: 1 }),
    after: "Test199",
  });
  const changes = { ...moved.changes, "person.0.health": 88 };
  const refreshed = adapter.view(bytes, { module: "characters", changes });
  expect(refreshed.changes).toEqual(changes);
  const result = adapter.apply(bytes, { changes: refreshed.changes });
  expect(new DataView(result.buffer).getInt16(36, true)).toBe(199);
  expect(new DataView(result.buffer).getInt16(0x366, true)).toBe(88);
  expect(adapter.view(result, { module: "inventory" }).selected).toBe("199");
});

it("normalizes position commands and removes cancelled additions and moves from drafts", () => {
  const bytes = jinyongFixture();
  const moved = adapter.view(bytes, {
    module: "inventory",
    changes: {
      "inventory.199.quantity": 8,
      "inventory.199.position": 1,
    },
  });
  expect(moved.changes).not.toHaveProperty("inventory.199.position");
  expect(moved.records[0]?.id).toBe("199");
  expect(adapter.view(bytes, { changes: moved.changes }).changes).toEqual(moved.changes);
  const removed = adapter.view(bytes, {
    changes: { ...moved.changes, "inventory.199.quantity": 0 },
  });
  expect(removed.changes).toEqual({});
  expect(removed.preview).toEqual([]);
  const empty = adapter.view(bytes, {
    module: "inventory",
    changes: { "inventory.174.quantity": 0 },
  });
  expect(empty.records.every(({ tags }) => tags.length === 0)).toBe(true);
  expect(empty.actions).toEqual([]);
  expect(empty.fields[1]).toMatchObject({ value: 0, readonly: true });
  expect(adapter.apply(bytes, { changes: empty.changes })).toEqual(
    adapter.apply(bytes, { changes: { "inventory.174.quantity": 0 } }),
  );
  for (const draft of [
    { changes: { "inventory.invalid": 1 } },
    { module: "characters", action: { id: "top", record: "174" } },
    { module: "inventory", action: { id: "top", record: "199" } },
  ])
    expect(() => adapter.view(bytes, draft)).toThrow();
});
