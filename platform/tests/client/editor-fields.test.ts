import { expect, it } from "vitest";
import { resolveEditorFields } from "../../client/controls/editor-fields.ts";
import type { EditorField } from "../../src/editors/types.ts";

function field(key: string, value: number, extra: Partial<EditorField> = {}): EditorField {
  return { key, value, label: key, group: "test", columnId: key, min: 0, max: 255, ...extra };
}

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
