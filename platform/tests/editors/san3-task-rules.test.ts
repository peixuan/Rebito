import { describe, expect, it } from "vitest";
import {
  resolveSan3TaskFields,
  retainSan3TaskChanges,
  san3TaskValues,
  taskEffectMaximum,
} from "../../src/editors/san3/task-rules.ts";
import type { EditorField } from "../../src/editors/types.ts";
import { message } from "../../src/shared/messages.ts";

const fields: EditorField[] = san3TaskValues.map((id) => ({
  key: `task.12.${id}`,
  columnId: id,
  label: message("san3.tasks"),
  group: message("san3.tasks"),
  value: id === "kind" ? 255 : id === "totalMonths" ? 1 : 0,
  min: 0,
  max: id === "targetCity" ? 45 : 255,
}));

describe("SAN3 task draft presentation rules", () => {
  it("prunes inactive task inputs only after an explicit kind change", () => {
    const changes = {
      "task.12.kind": 8,
      "task.12.totalMonths": 4,
      "task.12.elapsedMonths": 2,
      "task.12.effect": 12,
      "task.12.targetCity": 5,
      "task.13.effect": 3,
      "officer.12.morale": 90,
    };
    const treatment = retainSan3TaskChanges(fields, changes, "task.12.kind");
    expect(treatment).toEqual({
      "task.12.kind": 8,
      "task.12.totalMonths": 4,
      "task.12.elapsedMonths": 2,
      "task.13.effect": 3,
      "officer.12.morale": 90,
    });
    expect(retainSan3TaskChanges(fields, changes, "task.12.effect")).toEqual(changes);
    expect(retainSan3TaskChanges(fields.slice(0, 1), changes, "task.12.kind")).toEqual(changes);
    resolveSan3TaskFields(fields, changes);
    expect(changes["task.12.effect"]).toBe(12);
    expect(changes["task.12.targetCity"]).toBe(5);
  });

  it("enables spy destination and resolves dependent bounds without changing supplied values", () => {
    const originals = structuredClone(fields);
    const resolved = resolveSan3TaskFields(fields, {
      "task.12.kind": 7,
      "task.12.totalMonths": 15,
      "task.12.elapsedMonths": 4,
    });
    expect(resolved.find(({ columnId }) => columnId === "targetCity")?.readonly).toBe(false);
    expect(resolved.find(({ columnId }) => columnId === "effect")?.max).toBe(205);
    expect(resolved.find(({ columnId }) => columnId === "elapsedMonths")?.max).toBe(14);
    expect(resolved.find(({ columnId }) => columnId === "kind")?.value).toBe(255);
    expect(fields).toEqual(originals);
  });

  it("limits rules to complete server-declared task fields and ignores foreign or fractional drafts", () => {
    // Matching task metadata must not make a foreign field eligible for task rules.
    const unrelated = { ...fields[0], key: "money", readonly: true } as EditorField;
    expect(resolveSan3TaskFields([unrelated], { money: 7 })).toEqual([unrelated]);
    expect(resolveSan3TaskFields([fields[0] as EditorField], { "task.12.kind": 7 })).toEqual([
      fields[0],
    ]);
    expect(
      resolveSan3TaskFields(fields, { "task.12.kind": 7.5, "task.13.kind": 7 }).find(
        ({ columnId }) => columnId === "targetCity",
      )?.readonly,
    ).toBe(true);
    const treatment = resolveSan3TaskFields(fields, { "task.12.kind": 8 });
    expect(treatment.find(({ columnId }) => columnId === "effect")?.readonly).toBe(true);
    expect(treatment.find(({ columnId }) => columnId === "targetCity")?.readonly).toBe(true);
  });

  it("reflects native arithmetic boundaries and suppresses impossible transient clock maxima", () => {
    expect(taskEffectMaximum({ kind: 5, totalMonths: 1, elapsedMonths: 0 })).toBe(13);
    expect(taskEffectMaximum({ kind: 1, totalMonths: 15, elapsedMonths: 0 })).toBe(241);
    const resolved = resolveSan3TaskFields(fields, {
      "task.12.kind": 7,
      "task.12.totalMonths": -5,
      "task.12.elapsedMonths": 30,
    });
    expect(resolved.find(({ columnId }) => columnId === "effect")?.max).toBe(255);
    expect(resolved.find(({ columnId }) => columnId === "elapsedMonths")?.max).toBe(0);
  });

  it("preserves server-declared group locks and disables unknown task types", () => {
    const locked = fields.map((field) => ({ ...field, readonly: field.columnId === "kind" }));
    expect(
      resolveSan3TaskFields(locked, { "task.12.kind": 7 }).every((field) => field.readonly),
    ).toBe(true);
    for (const kind of [-1, 9, 256])
      expect(
        resolveSan3TaskFields(fields, { "task.12.kind": kind }).every((field) => field.readonly),
      ).toBe(true);
  });
});
