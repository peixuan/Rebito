import { expect, it } from "vitest";
import {
  changeEditorField,
  previewedEditorChanges,
  resolveEditorFields,
} from "../../client/controls/editor-fields.ts";
import type { EditorField } from "../../src/editors/types.ts";

function field(key: string, value: number, extra: Partial<EditorField> = {}): EditorField {
  return { key, value, label: key, group: "test", columnId: key, min: 0, max: 255, ...extra };
}

it("drops unchanged intents and never invents writes for derived preview effects", () => {
  const view = {
    changes: { base: 0, same: 5 },
    preview: [
      { key: "base", label: "Base", before: 5, after: 0 },
      { key: "effect", label: "Derived effect", before: 15, after: 10 },
    ],
  };
  expect(previewedEditorChanges(view)).toEqual({ base: 0 });
  expect(previewedEditorChanges({ ...view, preview: [] })).toEqual({});
  expect(view.changes).toEqual({ base: 0, same: 5 });
});

it("updates dependent maxima from drafts without losing values when a limit is lowered", () => {
  const maximum = field("maximum", 20);
  const fields = [maximum, field("current", 50, { maximumField: "maximum" })];
  const original = structuredClone(fields);
  expect(resolveEditorFields(fields)[1]).toMatchObject({ value: 50, max: 20, readonly: false });
  expect(fields).toEqual(original);
  maximum.value = 100;
  expect(resolveEditorFields(fields)[1]).toMatchObject({ value: 50, max: 100 });
});

it("enables new selections immediately and preserves explicit readonly controls", () => {
  const skill = field("skill", 0);
  const fields = [
    skill,
    field("maximum", 10, { enabledByField: "skill" }),
    field("current", 5, { maximumField: "maximum", enabledByField: "skill" }),
    field("fixed", 1, { enabledByField: "skill", readonly: true }),
  ];
  expect(
    resolveEditorFields(fields)
      .slice(1)
      .every((value) => value.readonly),
  ).toBe(true);
  skill.value = 4;
  expect(resolveEditorFields(fields).map((value) => value.readonly)).toEqual([
    false,
    false,
    false,
    true,
  ]);
  skill.value = 0;
  expect(resolveEditorFields(fields)[2]?.readonly).toBe(true);
});

it("disables unresolved dependencies while keeping unrelated controls usable", () => {
  const result = resolveEditorFields([
    field("plain", 5),
    field("current", 5, { maximumField: "missing" }),
    field("maximum", 5, { enabledByField: "missing" }),
  ]);
  expect(result.map((value) => value.readonly)).toEqual([false, true, true]);
  expect(result[1]?.max).toBe(255);
});

it("links totals to bases in either edit order without mutating drafts or stale captures", () => {
  const fields = [
    field("base", 20),
    field("target", 999, { derivedFrom: { key: "base", offset: 10 } }),
  ];
  const original = { unrelated: 4 };
  expect(resolveEditorFields(fields)[1]?.value).toBe(999);
  const target = changeEditorField(fields, original, "target", 70);
  expect(target).toEqual({ unrelated: 4, target: 70, base: 60 });
  expect(resolveEditorFields(fields, target).map(({ value }) => value)).toEqual([60, 70]);
  const base = changeEditorField(fields, target, "base", 25);
  expect(base).toEqual({ unrelated: 4, base: 25 });
  expect(resolveEditorFields(fields, base)[1]?.value).toBe(35);
  expect(changeEditorField(fields, base, "target", 10)).toEqual({
    unrelated: 4,
    base: 0,
    target: 10,
  });
  expect(original).toEqual({ unrelated: 4 });
  expect(fields.map(({ value }) => value)).toEqual([20, 999]);
});

it("shows wrapped stored totals while refusing edits through missing or readonly bases", () => {
  const base = field("base", 20);
  const target = field("target", 19, { derivedFrom: { key: "base", offset: -1, modulus: 65536 } });
  const fields = [base, target];
  expect(resolveEditorFields(fields, { base: 0 })[1]?.value).toBe(65535);
  const next = { unrelated: 1 };
  for (const broken of [[target], [{ ...base, readonly: true }, target]]) {
    expect(resolveEditorFields(broken).at(-1)?.readonly).toBe(true);
    expect(changeEditorField(broken, next, "target", 5)).toEqual(next);
  }
  expect(changeEditorField(fields, next, "missing", 5)).toEqual(next);
});
