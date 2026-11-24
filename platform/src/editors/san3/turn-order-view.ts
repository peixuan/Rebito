import { message } from "../../shared/messages.ts";
import type { EditorField } from "../types.ts";
import type { San3Document } from "./document.ts";
import { inspectSan3TurnOrder } from "./turn-order.ts";

/** Show every faction's place, but only offer remaining live slots as destinations. */
export function san3TurnOrderFields(document: San3Document, index: number): EditorField[] {
  const active = document.faction(index).active;
  let order: ReturnType<typeof inspectSan3TurnOrder>;
  try {
    order = inspectSan3TurnOrder(document);
  } catch {
    return [];
  }
  const position = order.factions.indexOf(index);
  const editable = active && position > order.cursor;
  const choices = order.factions.flatMap((faction, slot) =>
    slot > order.cursor && document.faction(faction).active
      ? [{ value: slot + 1, label: String(slot + 1) }]
      : [],
  );
  const state =
    !active || position < 0
      ? "absent"
      : position < order.cursor
        ? "completed"
        : position === order.cursor
          ? "current"
          : "upcoming";
  return [
    {
      key: `turnOrder.${index}.position`,
      columnId: "turnPosition",
      label: message("san3.turnPosition"),
      group: message("san3.turnOrder"),
      help: message("san3.turnOrderHelp"),
      value: position + 1,
      min: 0,
      max: order.factions.length,
      readonly: !editable,
      choices: editable
        ? choices
        : [
            {
              value: position + 1,
              label: position < 0 ? message("san3.none") : String(position + 1),
            },
          ],
    },
    {
      key: `context.turnState.${index}`,
      columnId: "turnState",
      label: message("san3.turnState"),
      group: message("san3.turnOrder"),
      value: 0,
      min: 0,
      max: 0,
      readonly: true,
      choices: [{ value: 0, label: message(`san3.turnState.${state}`) }],
    },
  ];
}
