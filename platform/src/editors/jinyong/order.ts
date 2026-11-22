import { message } from "../../shared/messages.ts";
import { type EditorDraft, EditorError } from "../types.ts";
import { type JinyongDocument, layout } from "./document.ts";

export const inventoryActions = ["top", "up", "down", "bottom"] as const;

function invalid(): never {
  throw new EditorError("invalid_edit", message("editor.invalidEdit"));
}

/** Replay an item permutation against the same base, never against the latest save.
 * Quantity edits run first. Removed items leave the order; newly added items append.
 * Slot keys are canonical draft state, while position fields/actions are commands.
 */
export function orderInventory(
  original: JinyongDocument,
  current: JinyongDocument,
  changes: Record<string, number>,
  action?: EditorDraft["action"],
) {
  const base = original.inventory().map(({ id }) => id);
  const requested = [...base];
  let move: { id: number; position: number } | undefined;
  for (const [key, value] of Object.entries(changes)) {
    const slot = /^inventory\.order\.(0|[1-9]\d{0,2})$/.exec(key);
    const position = /^inventory\.(0|[1-9]\d{0,2})\.position$/.exec(key);
    if (slot) {
      const index = Number(slot[1]);
      if (
        index >= layout.inventory.count ||
        !Number.isSafeInteger(value) ||
        value < -1 ||
        value >= layout.items.count
      )
        invalid();
      if (
        value !== -1 &&
        !base.includes(value) &&
        changes[`inventory.${value}.quantity`] === undefined
      )
        invalid();
      requested[index] = value;
    } else if (position) {
      if (move || !Number.isSafeInteger(value)) invalid();
      move = { id: Number(position[1]), position: value };
    } else if (!/^inventory\.(0|[1-9]\d{0,2})\.quantity$/.test(key)) {
      invalid();
    }
  }
  const priority = requested.filter((id) => id !== -1);
  if (new Set(priority).size !== priority.length) invalid();
  const bag = current.inventory().filter(({ id }) => id !== -1);
  const amounts = new Map(bag.map(({ id, amount }) => [id, amount]));
  const order = priority.filter((id) => amounts.has(id));
  for (const { id } of bag) if (!order.includes(id)) order.push(id);

  function moveTo(id: number, position: number) {
    const from = order.indexOf(id);
    if (from < 0 || position < 1 || position > order.length) invalid();
    order.splice(from, 1);
    order.splice(position - 1, 0, id);
  }
  if (move) moveTo(move.id, move.position);
  if (action) {
    if (!/^(0|[1-9]\d{0,2})$/.test(action.record)) invalid();
    const id = Number(action.record);
    const index = order.indexOf(id);
    if (index < 0) invalid();
    switch (action.id) {
      case "top":
        moveTo(id, 1);
        break;
      case "up":
        moveTo(id, Math.max(1, index));
        break;
      case "down":
        moveTo(id, Math.min(order.length, index + 2));
        break;
      case "bottom":
        moveTo(id, order.length);
        break;
      default:
        invalid();
    }
  }

  const output = current.copy();
  // Preserve gaps and unused words unless the actual occupied order changes.
  if (order.some((id, index) => id !== bag[index]?.id)) {
    const data = new DataView(output.buffer);
    for (let index = 0; index < layout.inventory.count; index++) {
      const id = order[index] ?? -1;
      const offset = layout.inventory.offset + index * 4;
      data.setInt16(offset, id, true);
      data.setInt16(offset + 2, amounts.get(id) ?? 0, true);
    }
  }
  const data = new DataView(output.buffer);
  const edits = base.flatMap((before, index) => {
    const after = data.getInt16(layout.inventory.offset + index * 4, true);
    return before === after ? [] : [{ key: `inventory.order.${index}`, index, before, after }];
  });
  return { output, edits };
}
