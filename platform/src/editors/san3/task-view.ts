import { message } from "../../shared/messages.ts";
import type { EditorView } from "../types.ts";
import { editSan3Tasks, taskFields } from "./campaign-tasks.ts";
import { type San3Document, san3Layout } from "./document.ts";
import { editSan3TaskJoin, san3TaskJoinFields } from "./task-joining.ts";

/** Named destinations remain server-declared; local rules only enable the selector. */
export function san3TaskFields(
  document: San3Document,
  index: number,
  original = document,
  changes: Record<string, number> = {},
) {
  const ownFaction = document.officer(index).faction;
  return [
    ...taskFields(document, index).map((field) =>
      field.columnId === "targetCity"
        ? {
            ...field,
            choices: Array.from({ length: san3Layout.cities.count }, (_, city) => ({
              value: city,
              label: document.city(city).name || message("san3.cityRecord", { index: city + 1 }),
            })).filter(({ value }) => {
              const faction = document.city(value).faction;
              return value === field.value || (faction !== 255 && faction !== ownFaction);
            }),
          }
        : field,
    ),
    ...san3TaskJoinFields(original, index).map((field) => ({
      ...field,
      value: changes[field.key] ?? field.value,
    })),
  ];
}

/** Only explicit task inputs are replayed; affected group members are preview effects. */
export function san3TaskDraft(document: San3Document, changes: Record<string, number>) {
  // A deselected join must not block a subsequent ordinary task draft.
  changes = { ...changes };
  for (const [key, value] of Object.entries(changes)) {
    if (!key.endsWith(".joinGroup") || value !== 65535) continue;
    editSan3TaskJoin(document, { [key]: value });
    delete changes[key];
  }
  if (Object.keys(changes).some((key) => key.endsWith(".joinGroup")))
    return editSan3TaskJoin(document, changes);
  const result = editSan3Tasks(document, changes);
  const preview: EditorView["preview"] = result.preview.map((entry) => {
    const match = /^task\.(\d+)\.(\w+)$/.exec(entry.key);
    if (!match) return entry;
    const index = Number(match[1]);
    const display = (value: typeof entry.before) =>
      typeof value !== "number"
        ? value
        : match[2] === "kind"
          ? message(`san3.taskKind${value}`)
          : match[2] === "targetCity"
            ? document.city(value).name || message("san3.cityRecord", { index: value + 1 })
            : value;
    return {
      ...entry,
      label: message("editor.columnLabel", {
        group: document.officer(index).name || message("san3.officerRecord", { index: index + 1 }),
        field: entry.label,
      }),
      before: display(entry.before),
      after: display(entry.after),
    };
  });
  return { bytes: result.bytes, changes: result.changes, preview };
}
