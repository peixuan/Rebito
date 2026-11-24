import { message } from "../../shared/messages.ts";
import { type EditorAdapter, type EditorDraft, EditorError } from "../types.ts";
import { san3BatchDraft } from "./batch-action.ts";
import { editSan3Presets, presetFields, San3PresetDocument, san3PresetLayout } from "./presets.ts";

const rowLabel = (index: number) => message(`san3.preset${index}`);
function prepare(bytes: Uint8Array, draft: EditorDraft) {
  if (
    (draft.slot !== undefined && draft.slot !== 0) ||
    (draft.module !== undefined && draft.module !== "presets") ||
    Object.keys(draft.textChanges ?? {}).length ||
    !/^[0-3]$/.test(draft.record ?? "0")
  )
    throw new EditorError("invalid_edit", message("editor.invalidEdit"));
  const original = new San3PresetDocument(bytes);
  const result = editSan3Presets(original, san3BatchDraft(original, draft, "preset"));
  return {
    ...result,
    edits: result.edits.filter(({ before, after }) => before !== after),
    document: new San3PresetDocument(result.bytes),
    selected: draft.record ?? "0",
  };
}

/** The registration overlay has its own schema; strategic commands stay unavailable. */
export const san3PresetAdapter: EditorAdapter = {
  size: 0x80000,
  view(bytes, draft) {
    const { document, edits, selected } = prepare(bytes, draft);
    const fields = presetFields(document, Number(selected)).map(
      ({ offset: _offset, width: _width, ...field }) => field,
    );
    return {
      instructions: message("san3.presetHelp"),
      slots: [{ index: 0, label: message("san3.checkpoint"), available: true }],
      slot: 0,
      modules: [{ id: "presets", label: message("san3.presetStats") }],
      module: "presets",
      columns: [
        ...fields.map(({ columnId: id, label }) => ({ id, label })),
        { id: "bonus", label: message("san3.presetBonus") },
      ],
      records: san3PresetLayout.bonus.map((bonus, index) => ({
        id: String(index),
        label: rowLabel(index),
        summary: message("san3.presetSummary", { bonus }),
        tags: [],
        available: true,
        cells: Object.fromEntries([
          ...presetFields(document, index).map((field) => [field.columnId, field.value]),
          ["bonus", bonus],
        ]),
      })),
      selected,
      fields,
      batchKeys: fields.map(({ key }) => key),
      actions: [],
      changes: Object.fromEntries(edits.map(({ field, after }) => [field.key, after])),
      preview: edits.map(({ field, before, after }) => ({
        key: field.key,
        label: message("editor.columnLabel", {
          group: rowLabel(Number(field.key.split(".")[1])),
          field: field.label,
        }),
        before,
        after,
      })),
    };
  },
  apply(bytes, draft) {
    const result = prepare(bytes, draft);
    if (!result.edits.length) throw new EditorError("no_changes", message("editor.noChanges"));
    return result.bytes;
  },
};
