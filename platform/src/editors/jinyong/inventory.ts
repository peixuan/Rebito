import { message } from "../../shared/messages.ts";
import { EditorError, type EditorField } from "../types.ts";
import { type JinyongDocument, layout } from "./document.ts";

/** One field per item avoids exposing duplicated or unallocated inventory slots. */
export function inventoryField(document: JinyongDocument, id: number): EditorField {
  document.name("items", id);
  return {
    key: `inventory.${id}.quantity`,
    label: message("jinyong.quantity"),
    group: message("jinyong.inventory"),
    columnId: "quantity",
    value: document.inventory().find((entry) => entry.id === id)?.amount ?? 0,
    min: 0,
    max: 30_000,
    help: message("jinyong.quantityHelp"),
  };
}

/** Silver is item 174. Adding/removing an item preserves a compact original bag. */
export function editInventory(document: JinyongDocument, changes: Record<string, number>) {
  const edits = Object.entries(changes)
    .map(([key, after]) => {
      const match = /^inventory\.(0|[1-9]\d{0,2})\.quantity$/.exec(key);
      if (!match) throw new EditorError("invalid_edit", message("editor.invalidEdit"));
      const id = Number(match[1]);
      const field = inventoryField(document, id);
      if (!Number.isSafeInteger(after) || after < field.min || after > field.max)
        throw new EditorError("invalid_edit", message("editor.invalidEdit"));
      return { id, field, before: field.value, after };
    })
    .filter(({ before, after }) => before !== after);
  const output = document.copy();
  const data = new DataView(output.buffer);
  const bag = document.inventory();
  let membershipChanged = false;
  for (const { id, after } of edits) {
    const index = bag.findIndex((entry) => entry.id === id);
    if (index >= 0 && after > 0) {
      bag[index] = { id, amount: after };
      data.setInt16(layout.inventory.offset + index * 4 + 2, after, true);
    } else {
      membershipChanged = true;
      if (index >= 0) bag[index] = { id: -1, amount: 0 };
      else bag.push({ id, amount: after });
    }
  }
  if (membershipChanged) {
    const occupied = bag.filter(({ id }) => id !== -1);
    if (occupied.length > layout.inventory.count)
      throw new EditorError("invalid_edit", message("editor.invalidEdit"));
    for (let index = 0; index < layout.inventory.count; index++) {
      const entry = occupied[index] ?? { id: -1, amount: 0 };
      const offset = layout.inventory.offset + index * 4;
      data.setInt16(offset, entry.id, true);
      data.setInt16(offset + 2, entry.amount, true);
    }
  }
  return { output, edits };
}
