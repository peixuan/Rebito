import { message } from "../../shared/messages.ts";
import { type EditorAdapter, type EditorDraft, EditorError, type EditorView } from "../types.ts";
import { JinyongDocument, layout } from "./document.ts";
import { editCharacters } from "./fields.ts";
import { editInventory } from "./inventory.ts";
import {
  displayValue,
  fieldsFor,
  type JinyongModule,
  modules,
  recordLabel,
  rowsFor,
} from "./view.ts";

function prepare(bytes: Uint8Array, draft: EditorDraft) {
  const original = new JinyongDocument(bytes);
  if ((draft.slot !== undefined && draft.slot !== 0) || draft.action)
    throw new EditorError("invalid_edit", message("editor.invalidEdit"));
  const module = draft.module ?? "characters";
  if (!modules.includes(module as JinyongModule))
    throw new EditorError("invalid_edit", message("editor.selectModule"));
  const changes = draft.changes ?? {};
  const entries = Object.entries(changes);
  const characters = editCharacters(
    original,
    Object.fromEntries(entries.filter(([key]) => !key.startsWith("inventory."))),
  );
  const inventory = editInventory(
    new JinyongDocument(characters.output),
    Object.fromEntries(entries.filter(([key]) => key.startsWith("inventory."))),
  );
  const preview: EditorView["preview"] = [...characters.edits, ...inventory.edits].map(
    ({ field, before, after }) => {
      const index = Number(field.key.split(".")[1]);
      const label = recordLabel(
        original,
        field.key.startsWith("inventory.") ? "inventory" : "characters",
        index,
      );
      return {
        key: field.key,
        label: message("editor.columnLabel", {
          group: label,
          field: message("editor.columnLabel", { group: field.group, field: field.label }),
        }),
        before: displayValue(field, before),
        after: displayValue(field, after),
      };
    },
  );
  const document = new JinyongDocument(inventory.output);
  const selected = draft.record ?? (module === "inventory" ? "174" : "0");
  const count = module === "inventory" ? layout.items.count : layout.persons.count;
  if (!/^(0|[1-9]\d{0,2})$/.test(selected) || Number(selected) >= count)
    throw new EditorError("invalid_edit", message("editor.selectRecord"));
  return {
    document,
    output: inventory.output,
    preview,
    changes,
    module: module as JinyongModule,
    selected,
  };
}

/** Original DOS R1/R2/R3 records only; world and event files remain opaque. */
export const jinyongAdapter: EditorAdapter = {
  size: layout.size,
  acceptsFile: (name) => /(?:^|\/)r[123]\.grp$/i.test(name),
  view(bytes, draft) {
    const { document, preview, changes, module, selected } = prepare(bytes, draft);
    const fields = fieldsFor(document, module, Number(selected));
    return {
      slots: [{ index: 0, label: message("jinyong.saveData"), available: true }],
      slot: 0,
      modules: modules.map((id) => ({ id, label: message(`jinyong.${id}`) })),
      module,
      columns:
        module === "skills"
          ? [{ id: "learned", label: message("jinyong.learned") }]
          : fields.map(({ columnId, label }) => ({ id: columnId, label })),
      records: rowsFor(document, module),
      selected,
      fields,
      actions: [],
      changes,
      preview,
    };
  },
  apply(bytes, draft) {
    const prepared = prepare(bytes, draft);
    if (!prepared.preview.length) throw new EditorError("no_changes", message("editor.noChanges"));
    return prepared.output;
  },
};
