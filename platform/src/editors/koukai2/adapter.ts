import { type DisplayText, displayMessage, message } from "../../shared/messages.ts";
import { type EditorAdapter, type EditorDraft, EditorError, type EditorField } from "../types.ts";
import { KoukaiDocument, layout, modules } from "./document.ts";
import { columnId, type EditorRecord, type Field } from "./fields.ts";
import { personNames } from "./names.ts";

function prepare(bytes: Uint8Array, draft: EditorDraft) {
  let document: KoukaiDocument;
  try {
    document = new KoukaiDocument(bytes);
  } catch (cause) {
    throw new EditorError("invalid_save", displayMessage(cause) ?? message("editor.invalidSave"));
  }
  try {
    const slot = draft.slot ?? document.slots.find((entry) => entry.active)?.index ?? 0;
    const changes = draft.action
      ? document.action(slot, draft.action.id, draft.action.record, draft.changes)
      : (draft.changes ?? {});
    const { output, preview } = document.edit(slot, changes);
    return {
      slot,
      changes,
      preview,
      output,
      document: preview.length ? new KoukaiDocument(output) : document,
    };
  } catch (cause) {
    throw new EditorError("invalid_edit", displayMessage(cause) ?? message("editor.invalidEdit"));
  }
}
function publicField(field: Field, value: number): EditorField {
  const result: EditorField = {
    key: field.key,
    label: field.label,
    group: field.group,
    columnId: columnId(field),
    min: field.min,
    max: field.max,
    value,
  };
  for (const key of ["choices", "boolean", "readonly", "multiplier", "divisor", "help"] as const)
    if (field[key] !== undefined) Object.assign(result, { [key]: field[key] });
  return result;
}
function cell(field: Field, value: number): number | DisplayText {
  if (field.choices)
    return (
      field.choices.find((choice) => choice.value === value)?.label ??
      message("editor.unknownValue", { value })
    );
  if (field.boolean) return value ? message("common.yes") : message("common.no");
  return (value * (field.multiplier ?? 1)) / (field.divisor ?? 1);
}
export const koukaiAdapter: EditorAdapter = {
  size: layout.size,
  view(bytes, draft) {
    const { slot, changes, preview, document } = prepare(bytes, draft);
    const module = draft.module ?? "main";
    let records: EditorRecord[];
    try {
      records = document.records(slot, module);
    } catch {
      throw new EditorError("invalid_edit", message("editor.selectModule"));
    }
    const selected = records.find((record) => record.id === draft.record) ?? records[0];
    if (!selected || (draft.record && selected.id !== draft.record))
      throw new EditorError("invalid_edit", message("editor.selectRecord"));
    const columns = new Map<string, DisplayText>();
    const rows = records.map((record) => {
      const cells: Record<string, DisplayText | number> = {};
      for (const field of record.fields.filter((value) => !value.hidden)) {
        const key = columnId(field);
        columns.set(key, message("editor.columnLabel", { group: field.group, field: field.label }));
        cells[key] = cell(field, document.value(field));
      }
      return {
        id: record.id,
        label: record.label,
        summary: record.summary ?? "",
        cells,
        tags: record.tags ?? [],
        available: record.available !== false,
      };
    });
    return {
      slots: document.slots.map((entry) => ({
        index: entry.index,
        available: entry.active,
        label: entry.active
          ? message("koukai2.activeSlot", {
              index: entry.index + 1,
              name: personNames[entry.hero] ?? "",
              date: entry.date,
            })
          : message("koukai2.emptySlot", { index: entry.index + 1 }),
      })),
      slot,
      modules: modules.map(({ id, label }) => ({ id, label })),
      module,
      columns: [...columns].map(([id, label]) => ({ id, label })),
      records: rows,
      ...(rows.some((row) => row.tags.includes("companion"))
        ? { filter: { tag: "companion", label: message("records.companionsOnly") } }
        : {}),
      selected: selected.id,
      fields: selected.fields
        .filter((field) => !field.hidden)
        .map((field) => publicField(field, document.value(field))),
      actions: selected.actions ?? [],
      changes,
      preview: preview.map(({ field, before, after }) => ({
        key: field.key,
        label: field.label,
        before: cell(field, before),
        after: cell(field, after),
      })),
    };
  },
  apply(bytes, draft) {
    const prepared = prepare(bytes, draft);
    if (!prepared.preview.length) throw new EditorError("no_changes", message("editor.noChanges"));
    return prepared.output;
  },
};
