import { message } from "../../shared/messages.ts";
import { type EditorAdapter, type EditorDraft, EditorError } from "../types.ts";
import { EiketsudenDocument, layout } from "./document.ts";
import { editFields } from "./fields.ts";
import type { EiketsudenRules } from "./rules.ts";
import { displayValue, type EiketsudenModule, fieldsFor, modules, rowsFor } from "./view.ts";

function prepare(bytes: Uint8Array, draft: EditorDraft, rules: EiketsudenRules | undefined) {
  if (!rules) throw new EditorError("unsupported_editor", message("eiketsuden.resourceRequired"));
  const original = new EiketsudenDocument(bytes);
  if (
    (draft.slot !== undefined && draft.slot !== 0) ||
    draft.action ||
    Object.keys(draft.textChanges ?? {}).length
  )
    throw new EditorError("invalid_edit", message("editor.invalidEdit"));
  const module = draft.module ?? "characters";
  if (!modules.includes(module as EiketsudenModule))
    throw new EditorError("invalid_edit", message("editor.selectModule"));
  const selected = draft.record ?? "0";
  const count = module === "characters" ? layout.characters.count : 1;
  if (!/^(0|[1-9]\d{0,2})$/.test(selected) || Number(selected) >= count)
    throw new EditorError("invalid_edit", message("editor.selectRecord"));
  const { output, edits } = editFields(original, rules, draft.changes ?? {});
  const preview = edits.map(({ field, before, after }) => ({
    key: field.key,
    label: message("editor.columnLabel", {
      group: field.key.startsWith("campaign.")
        ? message("eiketsuden.campaign")
        : (rules.characters[Number(field.key.split(".")[1])]?.name ?? ""),
      field: field.label,
    }),
    before: displayValue(field, before),
    after: displayValue(field, after),
  }));
  return {
    document: new EiketsudenDocument(output),
    output,
    preview,
    rules,
    changes: Object.fromEntries(edits.map(({ field, after }) => [field.key, after])),
    module: module as EiketsudenModule,
    selected,
  };
}

/** Original DOS native saves; no memory, event-state or immutable-resource writes. */
export function createEiketsudenAdapter(rules?: EiketsudenRules): EditorAdapter {
  return {
    size: layout.size,
    acceptsFile: (name) => /(?:^|\/)MSAVE[0-4]\.R3S$/i.test(name),
    requiredFiles: (name) => [{ name: name.replace(/MSAVE([0-4]\.R3S)$/i, "ESAVE$1") }],
    view(bytes, draft) {
      const prepared = prepare(bytes, draft, rules);
      const { document, module, selected } = prepared;
      const fields = fieldsFor(document, prepared.rules, module, Number(selected));
      return {
        slots: [{ index: 0, label: message("eiketsuden.saveData"), available: true }],
        slot: 0,
        modules: modules.map((id) => ({ id, label: message(`eiketsuden.${id}`) })),
        module,
        columns: fields.map(({ columnId, label }) => ({
          id: columnId,
          label,
          defaultVisible: ["level", "troopClass", "troops", "money"].includes(columnId),
        })),
        ...(module === "characters"
          ? {
              filter: {
                tag: "party",
                label: message("eiketsuden.partyOnly"),
                defaultEnabled: true,
              },
            }
          : {}),
        records: rowsFor(document, prepared.rules, module),
        selected,
        fields,
        fieldGroupOrder: ["progress", "items", "reference"].map((id) =>
          message(`eiketsuden.${id}`),
        ),
        actions: [],
        changes: prepared.changes,
        preview: prepared.preview,
      };
    },
    apply(bytes, draft) {
      const prepared = prepare(bytes, draft, rules);
      if (!prepared.preview.length)
        throw new EditorError("no_changes", message("editor.noChanges"));
      return prepared.output;
    },
  };
}

export const eiketsudenAdapter = createEiketsudenAdapter();
