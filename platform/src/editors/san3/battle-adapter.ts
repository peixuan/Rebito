import { message } from "../../shared/messages.ts";
import { type EditorAdapter, type EditorDraft, EditorError } from "../types.ts";
import { battleFields, editSan3Battle, San3BattleDocument } from "./battle.ts";

const label = (document: San3BattleDocument, index: number) =>
  document.officer(index).name || message("san3.officerRecord", { index: index + 1 });

function prepare(bytes: Uint8Array, draft: EditorDraft) {
  if (
    (draft.slot !== undefined && draft.slot !== 0) ||
    (draft.module !== undefined && draft.module !== "battle") ||
    draft.action ||
    Object.keys(draft.textChanges ?? {}).length ||
    (draft.record !== undefined && !/^(0|[1-9]\d{0,2})$/.test(draft.record))
  )
    throw new EditorError("invalid_edit", message("editor.invalidEdit"));
  const original = new San3BattleDocument(bytes);
  const selected = draft.record ?? String(original.selected);
  original.officer(Number(selected));
  const result = editSan3Battle(original, draft.changes ?? {});
  return {
    ...result,
    selected,
    document: new San3BattleDocument(result.bytes),
    edits: result.edits.filter(({ before, after }) => before !== after),
  };
}

/** Combat exposes reviewed mobility only; it cannot dispatch campaign or creation actions. */
export const san3BattleAdapter: EditorAdapter = {
  size: 0x80000,
  view(bytes, draft) {
    const { document, selected, edits } = prepare(bytes, draft);
    return {
      instructions: message("san3.battleInstructions"),
      slots: [{ index: 0, label: message("san3.checkpoint"), available: true }],
      slot: 0,
      modules: [{ id: "battle", label: message("san3.battle") }],
      module: "battle",
      columns: [{ id: "mobility", label: message("san3.mobility") }],
      records: document.indexes().map((index) => {
        const { mobility } = document.officer(index);
        return {
          id: String(index),
          label: label(document, index),
          summary: message("san3.battleSummary", { mobility }),
          tags: [],
          available: true,
          cells: { mobility },
        };
      }),
      selected,
      fields: battleFields(document, Number(selected)).map(
        ({ offset: _offset, width: _width, ...field }) => field,
      ),
      actions: [],
      changes: Object.fromEntries(edits.map(({ field, after }) => [field.key, after])),
      preview: edits.map(({ field, before, after }) => ({
        key: field.key,
        label: message("editor.columnLabel", {
          group: label(document, Number(field.key.split(".")[1])),
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
