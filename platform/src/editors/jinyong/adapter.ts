import { message } from "../../shared/messages.ts";
import { type EditorAdapter, type EditorDraft, EditorError, type EditorView } from "../types.ts";
import { JinyongDocument, layout } from "./document.ts";
import { editCharacters } from "./fields.ts";
import { editInventory } from "./inventory.ts";
import { inventoryActions, orderInventory } from "./order.ts";
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
  if (draft.slot !== undefined && draft.slot !== 0)
    throw new EditorError("invalid_edit", message("editor.invalidEdit"));
  const module = draft.module ?? "characters";
  if (!modules.includes(module as JinyongModule))
    throw new EditorError("invalid_edit", message("editor.selectModule"));
  if (draft.action && module !== "inventory")
    throw new EditorError("invalid_edit", message("editor.invalidEdit"));
  const changes = draft.changes ?? {};
  const entries = Object.entries(changes);
  const characters = editCharacters(
    original,
    Object.fromEntries(entries.filter(([key]) => !key.startsWith("inventory."))),
  );
  const inventoryChanges = Object.fromEntries(
    entries.filter(([key]) => key.startsWith("inventory.")),
  );
  const inventory = editInventory(
    new JinyongDocument(characters.output),
    Object.fromEntries(
      Object.entries(inventoryChanges).filter(([key]) => key.endsWith(".quantity")),
    ),
  );
  const ordered = orderInventory(
    original,
    new JinyongDocument(inventory.output),
    inventoryChanges,
    draft.action,
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
  for (const { key, index, before, after } of ordered.edits) {
    preview.push({
      key,
      label: message("jinyong.bagSlot", { index: index + 1 }),
      before:
        before === -1 ? message("jinyong.emptySlot") : recordLabel(original, "inventory", before),
      after:
        after === -1 ? message("jinyong.emptySlot") : recordLabel(original, "inventory", after),
    });
  }
  const document = new JinyongDocument(ordered.output);
  const selected =
    draft.record ??
    (module === "inventory"
      ? String(document.inventory().find(({ id }) => id !== -1)?.id ?? 174)
      : "0");
  const count = module === "inventory" ? layout.items.count : layout.persons.count;
  if (!/^(0|[1-9]\d{0,2})$/.test(selected) || Number(selected) >= count)
    throw new EditorError("invalid_edit", message("editor.selectRecord"));
  return {
    document,
    output: ordered.output,
    preview,
    changes: Object.fromEntries([
      ...[...characters.edits, ...inventory.edits].map(({ field, after }) => [field.key, after]),
      ...ordered.edits.map(({ key, after }) => [key, after]),
    ]),
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
    const held = document.inventory().filter(({ id }) => id !== -1);
    const position = held.findIndex(({ id }) => id === Number(selected));
    return {
      slots: [{ index: 0, label: message("jinyong.saveData"), available: true }],
      slot: 0,
      modules: modules.map((id) => ({ id, label: message(`jinyong.${id}`) })),
      module,
      columns:
        module === "skills"
          ? [{ id: "learned", label: message("jinyong.learned") }]
          : fields.map(({ columnId, label }) => ({
              id: columnId,
              label,
              defaultVisible: module === "inventory",
            })),
      ...(module === "inventory"
        ? { filter: { tag: "owned", label: message("jinyong.ownedOnly"), defaultEnabled: true } }
        : {}),
      records: rowsFor(document, module),
      selected,
      fields,
      actions:
        module === "inventory" && position >= 0
          ? inventoryActions
              .filter((id) =>
                id === "top" || id === "up" ? position > 0 : position < held.length - 1,
              )
              .map((id) => ({
                id,
                label: message(`jinyong.${id}`),
                help: message("jinyong.positionHelp"),
              }))
          : [],
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
