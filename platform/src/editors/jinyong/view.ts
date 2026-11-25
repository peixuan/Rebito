import { type DisplayText, message } from "../../shared/messages.ts";
import type { EditorField, EditorView } from "../types.ts";
import { type JinyongDocument, layout } from "./document.ts";
import { personFields, skillFields } from "./fields.ts";
import { inventoryField } from "./inventory.ts";

export const modules = ["characters", "skills", "inventory"] as const;
export type JinyongModule = (typeof modules)[number];

export function recordLabel(document: JinyongDocument, module: JinyongModule, index: number) {
  const name = document.name(module === "inventory" ? "items" : "persons", index);
  if (module === "inventory" && index === 174) return message("jinyong.silver", { name });
  return name || message("jinyong.record", { index });
}

export function displayValue(field: EditorField, value: number): number | DisplayText {
  if (field.choices)
    return (
      field.choices.find((entry) => entry.value === value)?.label ??
      message("editor.unknownValue", { value })
    );
  if (field.boolean) return message(value ? "common.yes" : "common.no");
  return value;
}

export function fieldsFor(
  document: JinyongDocument,
  module: JinyongModule,
  index: number,
): EditorField[] {
  if (module === "inventory") {
    const held = document.inventory().filter(({ id }) => id !== -1);
    const position = held.findIndex(({ id }) => id === index) + 1;
    return [
      inventoryField(document, index),
      {
        key: `inventory.${index}.position`,
        label: message("jinyong.position"),
        group: message("jinyong.inventory"),
        columnId: "position",
        value: position,
        min: position ? 1 : 0,
        max: held.length,
        readonly: !position,
        help: message("jinyong.positionHelp"),
      },
    ];
  }
  const fields =
    module === "characters" ? personFields(document, index) : skillFields(document, index);
  return fields.map(({ offset: _offset, unsigned: _unsigned, ...field }) => field);
}

/** Rows expose useful sortable values without constructing every skill choice list. */
export function rowsFor(document: JinyongDocument, module: JinyongModule): EditorView["records"] {
  const count = module === "inventory" ? layout.items.count : layout.persons.count;
  const bag = new Map(
    (module === "inventory" ? document.inventory() : [])
      .filter(({ id }) => id !== -1)
      .map(({ id, amount }, index) => [id, { quantity: amount, position: index + 1 }]),
  );
  const rows = Array.from({ length: count }, (_, index) => {
    const cells: Record<string, number | DisplayText> = {};
    if (module === "skills") {
      const start = layout.persons.offset + index * layout.persons.stride + 126;
      cells.learned = Array.from({ length: 10 }, (_, slot) =>
        document.word(start + slot * 2),
      ).filter((id) => id > 0).length;
    } else if (module === "inventory") {
      Object.assign(cells, bag.get(index) ?? { quantity: 0, position: 0 });
    } else {
      for (const field of fieldsFor(document, module, index))
        cells[field.columnId] = displayValue(field, field.value);
    }
    return {
      id: String(index),
      label: recordLabel(document, module, index),
      summary:
        module !== "inventory" && document.inParty(index) ? message("jinyong.partyMember") : "",
      tags: module === "inventory" && Number(cells.position) > 0 ? ["owned"] : [],
      available: true,
      cells,
    };
  });
  // Held items follow the native bag; the remaining catalog is available for adding.
  return module === "inventory"
    ? rows.sort(
        (left, right) =>
          (Number(left.cells.position) || Infinity) - (Number(right.cells.position) || Infinity),
      )
    : rows;
}
