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

it("previews derived totals from bases without accepting writes or mutating stale captures", () => {
  const fields = [
    field("base", 20),
    field("computed", 999, { derivedFrom: { key: "base", offset: 10 } }),
  ];
  const original = { unrelated: 4 };
  expect(resolveEditorFields(fields)[1]).toMatchObject({ value: 999, readonly: true });
  expect(changeEditorField(fields, original, "computed", 70)).toEqual(original);
  const base = changeEditorField(fields, original, "base", 25);
  expect(base).toEqual({ unrelated: 4, base: 25 });
  expect(resolveEditorFields(fields, base)[1]?.value).toBe(35);
  expect(changeEditorField(fields, base, "computed", 10)).toEqual(base);
  expect(resolveEditorFields(fields, { base: 0 })[1]?.value).toBe(10);
  expect(original).toEqual({ unrelated: 4 });
  expect(fields.map(({ value }) => value)).toEqual([20, 999]);
});

it("shows wrapped totals while keeping derived controls read-only for every base state", () => {
  const base = field("base", 20);
  const computed = field("computed", 19, {
    derivedFrom: { key: "base", offset: -1, modulus: 65536 },
  });
  const fields = [base, computed];
  expect(resolveEditorFields(fields, { base: 0 })[1]?.value).toBe(65535);
  const next = { unrelated: 1 };
  for (const configuration of [fields, [computed], [{ ...base, readonly: true }, computed]]) {
    expect(resolveEditorFields(configuration).at(-1)?.readonly).toBe(true);
    expect(changeEditorField(configuration, next, "computed", 5)).toEqual(next);
  }
  expect(changeEditorField(fields, next, "missing", 5)).toEqual(next);
});
