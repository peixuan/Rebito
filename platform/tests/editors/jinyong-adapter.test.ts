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
  expect(view.fields).toHaveLength(28);
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
