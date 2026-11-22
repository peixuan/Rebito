import { type DisplayText, message } from "../../shared/messages.ts";
import { type EditorAdapter, type EditorDraft, EditorError, type EditorField } from "../types.ts";
import { layout, PhantasyStar4Document } from "./document.ts";
import {
  abilityFields,
  characterFields,
  editFields,
  inventoryFields,
  partyFields,
} from "./fields.ts";

const modules = ["party", "characters", "inventory", "abilities"] as const;
type Module = (typeof modules)[number];
const invalid = () => new EditorError("invalid_edit", message("editor.invalidEdit"));
function indexOf(record: string, count: number) {
  if (!/^(0|[1-9]\d?)$/.test(record) || Number(record) >= count) throw invalid();
  return Number(record);
}
function itemName(id: number) {
  return message(`phantasyStar4.items.${id}`);
}
function label(module: Module, index: number): DisplayText {
  return module === "party"
    ? message("phantasyStar4.party")
    : module === "inventory"
      ? message("phantasyStar4.position", { index: index + 1 })
      : message(`phantasyStar4.characters.${index}`);
}
function fields(document: PhantasyStar4Document, module: Module, index: number): EditorField[] {
  const result =
    module === "party"
      ? partyFields(document)
      : module === "inventory"
        ? inventoryFields(document, index)
        : module === "abilities"
          ? abilityFields(document, index)
          : characterFields(document, index);
  return result.map(({ offset: _, width: __, ...field }) => {
    const catalog =
      field.columnId === "item" ||
      ["rightHand", "leftHand", "head", "body"].includes(field.columnId)
        ? "items"
        : field.columnId === "technique"
          ? "techniques"
          : field.columnId === "skill"
            ? "skills"
            : undefined;
    const count =
      catalog === "items"
        ? layout.itemCount
        : catalog === "techniques"
          ? layout.techniqueCount
          : layout.skillCount;
    return {
      ...field,
      ...(catalog
        ? {
            choices: Array.from({ length: count }, (_, value) => ({
              value,
              label: message(`phantasyStar4.${catalog}.${value}`),
            })),
          }
        : {}),
      ...(field.readonly ? { help: message("phantasyStar4.readonlyHelp") } : {}),
    };
  });
}

function prepare(bytes: Uint8Array, draft: EditorDraft) {
  if (draft.slot !== undefined && draft.slot !== 0) throw invalid();
  const module = draft.module ?? "characters";
  if (!modules.includes(module as Module)) throw invalid();
  const original = new PhantasyStar4Document(bytes);
  const changes = { ...draft.changes };
  let prepared = editFields(original, changes);
  if (draft.action) {
    if (module !== "inventory") throw invalid();
    const inventory = new PhantasyStar4Document(prepared.output).inventory();
    const occupied = inventory.flatMap((id, index) => (id === 0 ? [] : [index]));
    const from = occupied.indexOf(indexOf(draft.action.record, layout.inventory.count));
    if (from < 0) throw invalid();
    const items = inventory.filter(Boolean);
    const to =
      draft.action.id === "top"
        ? 0
        : draft.action.id === "up"
          ? from - 1
          : draft.action.id === "down"
            ? from + 1
            : -1;
    if (to < 0 || to >= items.length || to === from) throw invalid();
    const item = items.splice(from, 1)[0];
    if (item === undefined) throw invalid();
    items.splice(to, 0, item);
    for (let index = 0; index < layout.inventory.count; index++)
      changes[`inventory.${index}.item`] = items[index] ?? 0;
    prepared = editFields(original, changes);
  }
  const document = new PhantasyStar4Document(prepared.output);
  const selected =
    draft.record ??
    String(module === "characters" || module === "abilities" ? document.party()[0] : 0);
  const count =
    module === "party" ? 1 : module === "inventory" ? layout.inventory.count : layout.persons.count;
  indexOf(selected, count);
  return { ...prepared, document, original, module: module as Module, selected, count };
}

/** Edits the captured game RAM; game-native save commands remain the game's responsibility. */
export const phantasyStar4Adapter: EditorAdapter = {
  size: layout.size,
  view(bytes, draft) {
    const value = prepare(bytes, draft);
    const { document, module, selected, count, edits } = value;
    const selectedFields = fields(document, module, Number(selected));
    const preview = edits.map(({ field, before, after }) => {
      const parts = field.key.split(".");
      const editedModule =
        parts[0] === "party"
          ? "party"
          : parts[0] === "inventory"
            ? "inventory"
            : parts[0] === "ability"
              ? "abilities"
              : "characters";
      return {
        key: field.key,
        label: message("editor.columnLabel", {
          group: label(editedModule, Number(parts[1]) || 0),
          field: message("editor.columnLabel", { group: field.group, field: field.label }),
        }),
        before: editedModule === "inventory" ? itemName(before) : before,
        after: editedModule === "inventory" ? itemName(after) : after,
      };
    });
    const held = document.inventory().flatMap((id, index) => (id === 0 ? [] : [index]));
    const selectedHeld = held.indexOf(Number(selected));
    return {
      slots: [{ index: 0, label: message("phantasyStar4.checkpoint"), available: true }],
      slot: 0,
      modules: modules.map((id) => ({ id, label: message(`phantasyStar4.${id}`) })),
      module,
      columns:
        module === "abilities"
          ? []
          : selectedFields.map(({ columnId: id, label }) => ({
              id,
              label,
              defaultVisible: ["money", "item", "level", "health", "energy"].includes(id),
            })),
      ...(module === "inventory"
        ? {
            filter: {
              tag: "owned",
              label: message("phantasyStar4.ownedOnly"),
              defaultEnabled: true,
            },
          }
        : {}),
      records: Array.from({ length: count }, (_, index) => ({
        id: String(index),
        label: label(module, index),
        summary:
          module === "inventory"
            ? itemName(document.inventory()[index] ?? 0)
            : module === "party"
              ? message("phantasyStar4.party")
              : message(
                  document.inParty(index) ? "phantasyStar4.inParty" : "phantasyStar4.outsideParty",
                ),
        tags:
          module === "inventory"
            ? held.includes(index)
              ? ["owned"]
              : []
            : module === "party"
              ? []
              : document.inParty(index)
                ? ["party"]
                : [],
        available: true,
        cells: Object.fromEntries(
          fields(document, module, index).map((field) => [
            field.columnId,
            field.choices?.find(({ value }) => value === field.value)?.label ?? field.value,
          ]),
        ),
      })),
      selected,
      fields: selectedFields,
      actions:
        module === "inventory" && selectedHeld >= 0
          ? ["top", "up", "down"]
              .filter((id) => (id === "down" ? selectedHeld < held.length - 1 : selectedHeld > 0))
              .map((id) => ({
                id,
                label: message(`phantasyStar4.${id}`),
                help: message("phantasyStar4.orderHelp"),
              }))
          : [],
      changes: Object.fromEntries(edits.map(({ field, after }) => [field.key, after])),
      preview,
    };
  },
  apply(bytes, draft) {
    const prepared = prepare(bytes, draft);
    if (!prepared.edits.length) throw new EditorError("no_changes", message("editor.noChanges"));
    return prepared.output;
  },
};
