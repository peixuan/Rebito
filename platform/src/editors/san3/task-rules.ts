import { message } from "../../shared/messages.ts";
import type { EditorField } from "../types.ts";

export const san3TaskValues = [
  "kind",
  "totalMonths",
  "elapsedMonths",
  "effect",
  "targetCity",
] as const;
export type San3TaskDraft = Record<(typeof san3TaskValues)[number], number>;

/** Changing a task kind discards only draft inputs that no longer have a meaning. */
export function retainSan3TaskChanges(
  fields: readonly EditorField[],
  changes: Record<string, number>,
  changedKey: string,
) {
  const match = /^task\.(0|[1-9]\d{0,2})\.kind$/.exec(changedKey);
  if (!match) return changes;
  const prefix = `task.${match[1]}.`;
  const declared = new Set(fields.map(({ key }) => key));
  if (san3TaskValues.some((id) => !declared.has(prefix + id))) return changes;
  const kind = changes[changedKey];
  if (!Number.isInteger(kind) || kind === undefined || (kind !== 255 && (kind < 0 || kind > 8)))
    return changes;
  const retained = { ...changes };
  for (const id of san3TaskValues) {
    if (
      (kind === 255 && id !== "kind") ||
      (kind === 8 && id === "effect") ||
      (kind !== 7 && id === "targetCity")
    )
      delete retained[prefix + id];
  }
  return retained;
}

/** Avoid native byte additions and flood-control signed multiplication wrapping. */
export function taskEffectMaximum(
  task: Pick<San3TaskDraft, "kind" | "totalMonths" | "elapsedMonths">,
) {
  const months = task.totalMonths;
  if (task.kind === 1) return 256 - months;
  if (task.kind === 2) return months > 1 ? 246 : 255;
  if (task.kind === 3) return 255 - Math.floor((months - 1) / 2);
  if (task.kind === 4) return 255 - months;
  if (task.kind === 5) return 13;
  if (task.kind === 6) return 9999;
  if (task.kind === 7) return 255 - (months - task.elapsedMonths - 1) * 5;
  return 255;
}

/** Resolve only declared task controls; no game bytes or authorization decisions enter the client. */
export function resolveSan3TaskFields(
  fields: readonly EditorField[],
  changes: Record<string, number>,
): EditorField[] {
  const values = new Map(fields.map((field) => [field.key, field.value]));
  const declared = new Map(fields.map((field) => [field.key, field]));
  for (const [key, value] of Object.entries(changes)) {
    if (values.has(key) && Number.isSafeInteger(value)) values.set(key, value);
  }
  return fields.map((field) => {
    const match =
      /^task\.(0|[1-9]\d{0,2})\.(kind|totalMonths|elapsedMonths|effect|targetCity)$/.exec(
        field.key,
      );
    if (!match) return field;
    const prefix = `task.${match[1]}.`;
    if (san3TaskValues.some((id) => !values.has(prefix + id))) return field;
    const kind = Number(values.get(`${prefix}kind`));
    const locked = declared.get(`${prefix}kind`)?.readonly;
    const knownKind = (kind >= 0 && kind <= 8) || kind === 255;
    const totalMonths = Math.min(15, Math.max(1, Number(values.get(`${prefix}totalMonths`))));
    const elapsedMonths = Math.min(
      totalMonths - 1,
      Math.max(0, Number(values.get(`${prefix}elapsedMonths`))),
    );
    const id = match[2];
    const max =
      id === "elapsedMonths"
        ? totalMonths - 1
        : id === "effect"
          ? taskEffectMaximum({ kind, totalMonths, elapsedMonths })
          : field.max;
    return {
      ...field,
      max,
      readonly:
        Boolean(locked) ||
        !knownKind ||
        (kind === 255 && id !== "kind") ||
        (kind === 8 && id === "effect") ||
        (kind !== 7 && id === "targetCity"),
      ...(id === "effect" && kind >= 0 && kind <= 8
        ? { label: message(`san3.taskEffect${kind}`), help: message(`san3.taskEffect${kind}Help`) }
        : {}),
    };
  });
}
