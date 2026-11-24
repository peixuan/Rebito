import { message } from "../../shared/messages.ts";
import { EditorError, type EditorField, type EditorView } from "../types.ts";
import type { San3Document } from "./document.ts";
import { inspectSan3Lists } from "./relocation.ts";
import {
  san3TaskValues as ids,
  resolveSan3TaskFields,
  type San3TaskDraft,
  taskEffectMaximum,
} from "./task-rules.ts";

const invalid = () => new EditorError("invalid_edit", message("editor.invalidEdit"));
type TaskValue = (typeof ids)[number];
export type San3Task = San3TaskDraft & { city: number; members: number[] };
const taskBit = (kind: number) => (kind === 7 ? 0 : 1 << Math.min(kind, 7));

/** Tasks share their clock and output across up to ten same-city participants. */
export function inspectSan3Task(document: San3Document, index: number): San3Task {
  const base = document.offset("officers", index);
  const { cities, membership } = inspectSan3Lists(document);
  const member = membership.get(index);
  if (member?.kind !== "serving") throw invalid();
  const active = (document.read(base + 9, 1) & 64) !== 0;
  const kind = active ? document.read(base + 26, 1) : 255;
  if (active && kind > 8) throw invalid();
  const members =
    active && kind !== 7
      ? (cities[member.city]?.serving.filter((candidate) => {
          const offset = document.offset("officers", candidate);
          return (
            (document.read(offset + 9, 1) & 64) !== 0 && document.read(offset + 26, 1) === kind
          );
        }) ?? [])
      : [index];
  if (members.length > 10) throw invalid();
  const clock = active ? document.read(base + 27, 1) : 1;
  const effect = active ? document.read(base + 28, 2) : 0;
  if (active && ((clock & 15) === 0 || clock >> 4 >= (clock & 15))) throw invalid();
  for (const candidate of members) {
    const offset = document.offset("officers", candidate);
    if (
      (document.read(offset + 8, 1) & 0x14) !== 0 ||
      (active &&
        (document.read(offset + 27, 1) !== clock || document.read(offset + 28, 2) !== effect))
    )
      throw invalid();
  }
  if (
    active &&
    kind !== 7 &&
    (document.read(document.offset("cities", member.city) + 24, 1) & taskBit(kind)) === 0
  )
    throw invalid();
  return {
    city: member.city,
    members,
    kind,
    totalMonths: clock & 15,
    elapsedMonths: clock >> 4,
    effect: kind === 1 || kind === 7 ? effect & 255 : effect,
    targetCity: kind === 7 ? effect >> 8 : member.city,
  };
}

function validTask(document: San3Document, task: San3Task) {
  if (![...Array(9).keys(), 255].includes(task.kind)) throw invalid();
  if (task.kind === 255) return;
  if (
    task.totalMonths < 1 ||
    task.totalMonths > 15 ||
    task.elapsedMonths < 0 ||
    task.elapsedMonths >= task.totalMonths
  )
    throw invalid();
  if (task.kind !== 8 && (task.effect < 0 || task.effect > taskEffectMaximum(task)))
    throw invalid();
  if (task.kind === 7) {
    document.offset("cities", task.targetCity);
    const origin = document.city(task.city).faction;
    const target = document.city(task.targetCity).faction;
    if (target === 255 || target === origin) throw invalid();
  }
}

/** Fields represent a task group, never raw flag/clock bytes. */
export function taskFields(
  document: San3Document,
  index: number,
  pending: Partial<Record<TaskValue, number>> = {},
): EditorField[] {
  let task: San3Task;
  try {
    task = { ...inspectSan3Task(document, index), ...pending };
  } catch {
    return [];
  }
  return resolveSan3TaskFields(
    ids.map((id) => ({
      key: `task.${index}.${id}`,
      label: message(`san3.task.${id}`),
      group: message("san3.tasks"),
      columnId: id,
      value: task[id],
      min: id === "totalMonths" ? 1 : 0,
      max: id === "kind" ? 255 : id === "totalMonths" ? 15 : id === "targetCity" ? 45 : 0,
      ...(id === "kind"
        ? {
            choices: [...Array(9).keys(), 255].map((value) => ({
              value,
              label: message(`san3.taskKind${value}`),
            })),
          }
        : {}),
      help: message("san3.taskGroupHelp", { count: task.members.length }),
    })),
    {},
  );
}

/** Update or cancel complete task groups; native monthly execution applies their results. */
export function editSan3Tasks(document: San3Document, changes: Record<string, number>) {
  const requests = new Map<number, Record<string, number>>();
  for (const [key, value] of Object.entries(changes)) {
    const match =
      /^task\.(0|[1-9]\d{0,2})\.(kind|totalMonths|elapsedMonths|effect|targetCity)$/.exec(key);
    if (!match || !Number.isSafeInteger(value)) throw invalid();
    const index = Number(match[1]);
    requests.set(index, { ...requests.get(index), [match[2] as string]: value });
  }
  const plans = [...requests]
    .map(([index, values]) => {
      const before = inspectSan3Task(document, index);
      const after = { ...before, ...values };
      const altered = ids.filter((id) => values[id] !== undefined && before[id] !== after[id]);
      if (!altered.length) return undefined;
      if (after.kind === 255 && altered.some((id) => id !== "kind")) throw invalid();
      if (after.kind === 8 && altered.includes("effect")) throw invalid();
      if (after.kind !== 7 && altered.includes("targetCity")) throw invalid();
      validTask(document, after);
      return { index, before, after, altered };
    })
    .filter((plan) => plan !== undefined);
  const touched = new Set<number>();
  const groups = new Set<string>();
  for (const { before, after } of plans) {
    for (const index of before.members) {
      if (touched.has(index)) throw invalid();
      touched.add(index);
      const base = document.offset("officers", index);
      if (
        after.kind !== 255 &&
        ((document.read(base + 8, 1) & 0x1c) !== 0 ||
          (document.read(base + 9, 1) & 7) !== 0 ||
          (document.read(base + 10, 1) & 15) !== 0)
      )
        throw invalid();
    }
    if (after.kind === 255 || after.kind === 7) continue;
    const group = `${after.city}.${after.kind}`;
    if (groups.has(group)) throw invalid();
    groups.add(group);
    for (const index of inspectSan3Lists(document).cities[after.city]?.serving ?? []) {
      if (before.members.includes(index)) continue;
      const base = document.offset("officers", index);
      if (
        document.read(base + 16, 1) === after.city &&
        (document.read(base + 9, 1) & 64) !== 0 &&
        document.read(base + 26, 1) === after.kind
      )
        throw invalid();
    }
  }
  const bytes = document.copy();
  const data = new DataView(bytes.buffer);
  const preview: EditorView["preview"] = [];
  const intents: Record<string, number> = {};
  const summary = (task: San3Task) =>
    task.kind === 255
      ? message("san3.taskKind255")
      : message(task.kind === 7 ? "san3.spyTaskSummary" : "san3.taskSummary", {
          kind: message(`san3.taskKind${task.kind}`),
          elapsed: task.elapsedMonths,
          total: task.totalMonths,
          effect: task.effect,
          city: document.city(task.targetCity).name,
        });
  const changesByOffset = new Map<
    number,
    { offset: number; width: 1 | 2; before: number; after: number }
  >();
  const write = (offset: number, width: 1 | 2, after: number) => {
    const before = width === 1 ? data.getUint8(offset) : data.getUint16(offset);
    if (before === after) return;
    changesByOffset.set(offset, {
      offset,
      width,
      before: changesByOffset.get(offset)?.before ?? before,
      after,
    });
    if (width === 1) data.setUint8(offset, after);
    else data.setUint16(offset, after);
  };
  for (const { index, before, after, altered } of plans) {
    for (const id of altered) {
      const key = `task.${index}.${id}`;
      intents[key] = after[id];
      preview.push({
        key,
        label: message(`san3.task.${id}`),
        before: before[id],
        after: after[id],
      });
    }
    const city = document.offset("cities", after.city) + 24;
    const active = after.kind !== 255;
    const flags =
      (data.getUint8(city) & ~(before.kind === 255 ? 0 : taskBit(before.kind))) |
      (active ? taskBit(after.kind) : 0);
    write(city, 1, flags);
    for (const member of before.members) {
      const base = document.offset("officers", member);
      const clock = active ? (after.elapsedMonths << 4) | after.totalMonths : 0;
      const effect = active
        ? after.kind === 7
          ? (after.targetCity << 8) | after.effect
          : after.kind === 1 && before.kind === 1
            ? (document.read(base + 28, 2) & 0xff00) | after.effect
            : after.effect
        : 0;
      write(base + 9, 1, (data.getUint8(base + 9) & ~64) | (active ? 64 : 0));
      if (active) write(base + 8, 1, data.getUint8(base + 8) | 1);
      write(base + 26, 1, after.kind);
      write(base + 27, 1, clock);
      write(base + 28, 2, effect);
      preview.push({
        key: `taskMember.${member}`,
        label: message("san3.taskMember", {
          name: document.officer(member).name || String(member + 1),
        }),
        before: summary(before),
        after: summary(after),
      });
    }
  }
  return {
    bytes,
    writes: [...changesByOffset.values()].filter(({ before, after }) => before !== after),
    preview,
    changes: intents,
    groups: plans.map(({ before }) => before.members),
  };
}
