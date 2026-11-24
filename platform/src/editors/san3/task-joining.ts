import { message } from "../../shared/messages.ts";
import { EditorError, type EditorField } from "../types.ts";
import { inspectSan3Task, validateSan3Task } from "./campaign-tasks.ts";
import { San3Document } from "./document.ts";
import { san3OperationLabels, san3OperationPreview } from "./operation-preview.ts";
import { inspectSan3Lists } from "./relocation.ts";

const invalid = () => new EditorError("invalid_edit", message("editor.invalidEdit"));

function joining(document: San3Document, index: number, representative: number) {
  const before = inspectSan3Task(document, index);
  const group = inspectSan3Task(document, representative);
  if (
    before.kind !== 255 ||
    group.kind === 255 ||
    group.kind === 7 ||
    group.city !== before.city ||
    group.members.length >= 10
  )
    throw invalid();
  validateSan3Task(document, group);
  for (const member of [index, ...group.members]) {
    const base = document.offset("officers", member);
    if (
      (document.read(base + 8, 1) & 0x1c) !== 0 ||
      (document.read(base + 9, 1) & 15) !== 0 ||
      (document.read(base + 10, 1) & 15) !== 0
    )
      throw invalid();
  }
  return group;
}

function groupLabel(document: San3Document, representative: number) {
  const group = inspectSan3Task(document, representative);
  return message("san3.taskJoinChoice", {
    task: message(`san3.taskKind${group.kind}`),
    leader: san3OperationLabels(document).officer(representative),
    count: group.members.length,
  });
}

/** Only shared same-city tasks are offered; spies retain their individual assignment workflow. */
export function san3TaskJoinFields(document: San3Document, index: number): EditorField[] {
  try {
    const current = inspectSan3Task(document, index);
    if (current.kind !== 255) return [];
    const seen = new Set<number>();
    const choices: NonNullable<EditorField["choices"]> = [
      { value: 65535, label: message("san3.none") },
    ];
    for (const representative of inspectSan3Lists(document).cities[current.city]?.serving ?? []) {
      const base = document.offset("officers", representative);
      const kind = document.read(base + 26, 1);
      if ((document.read(base + 9, 1) & 64) === 0 || seen.has(kind)) continue;
      seen.add(kind);
      try {
        joining(document, index, representative);
        choices.push({ value: representative, label: groupLabel(document, representative) });
      } catch {
        // A different task may still be a valid destination for this selected officer.
      }
    }
    return choices.length < 2
      ? []
      : [
          {
            key: `task.${index}.joinGroup`,
            columnId: "joinGroup",
            label: message("san3.taskJoin"),
            group: message("san3.tasks"),
            help: message("san3.taskJoinHelp"),
            value: 65535,
            min: 0,
            max: 65535,
            choices,
          },
        ];
  } catch {
    return [];
  }
}

/** Joining copies the group's exact stored clock/result; existing members are never rewritten. */
export function editSan3TaskJoin(document: San3Document, changes: Record<string, number>) {
  const entries = Object.entries(changes);
  if (entries.length !== 1) throw invalid();
  const [key, representative] = entries[0] as [string, number];
  const match = /^task\.(0|[1-9]\d{0,2})\.joinGroup$/.exec(key);
  if (!match || !Number.isSafeInteger(representative)) throw invalid();
  const index = Number(match[1]);
  const base = document.offset("officers", index);
  if (representative === 65535) return { bytes: document.copy(), changes: {}, preview: [] };
  const group = joining(document, index, representative);
  const source = document.offset("officers", representative);
  const bytes = document.copy();
  bytes[base + 8] = document.read(base + 8, 1) | 1;
  bytes[base + 9] = document.read(base + 9, 1) | 64;
  for (let relative = 26; relative < 30; relative++)
    bytes[base + relative] = document.read(source + relative, 1);
  const after = inspectSan3Task(new San3Document(bytes), index);
  if (after.members.length !== group.members.length + 1) throw invalid();
  const names = san3OperationLabels(document);
  const { append, preview } = san3OperationPreview();
  append(
    key,
    names.officer(index),
    "taskJoin",
    message("san3.none"),
    groupLabel(document, representative),
  );
  append(
    `taskJoinEffect.${index}.members`,
    names.officer(representative),
    "taskGroupSize",
    group.members.length,
    after.members.length,
  );
  append(
    `taskJoinEffect.${index}.task`,
    names.officer(index),
    "task.kind",
    message("san3.taskKind255"),
    message("san3.taskSummary", {
      kind: message(`san3.taskKind${group.kind}`),
      elapsed: group.elapsedMonths,
      total: group.totalMonths,
      effect: group.effect,
    }),
  );
  append(
    `taskEffect.${index}.actionComplete`,
    names.officer(index),
    "actionComplete",
    document.read(base + 8, 1) & 1,
    1,
  );
  return { bytes, changes: { [key]: representative }, preview };
}
