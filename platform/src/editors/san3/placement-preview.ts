import { message } from "../../shared/messages.ts";
import type { San3Document } from "./document.ts";
import { san3OperationLabels, type san3OperationPreview } from "./operation-preview.ts";

/** Describe known placement effects without exposing reset bytes as writable intents. */
export function appendSan3PlacementEffects(
  before: San3Document,
  after: San3Document,
  index: number,
  prefix: "lifeEffect" | "presenceEffect" | "appearanceEffect",
  append: ReturnType<typeof san3OperationPreview>["append"],
) {
  const names = san3OperationLabels(before);
  const group = names.officer(index);
  const base = before.offset("officers", index);
  const effect = (id: string, oldValue: number, newValue: number) => {
    if (oldValue !== newValue) append(`${prefix}.${index}.${id}`, group, id, oldValue, newValue);
  };
  for (const [relative, width, id] of [
    [2, 2, prefix === "lifeEffect" ? "storedRetiredSoldiers" : "soldiers"],
    [15, 1, "loyalty"],
    [18, 1, "serviceYears"],
    [20, 1, "originServiceYears"],
    [21, 1, "training"],
    [22, 1, "morale"],
  ] as const)
    effect(id, before.read(base + relative, width), after.read(base + relative, width));
  for (const [relative, mask, shift, id] of [
    [8, 1, 0, "actionComplete"],
    [8, 4, 2, "inBattle"],
    [8, 8, 3, "rebellion"],
    [9, 7, 0, "recoveryMonths"],
    [9, 8, 3, "recoveryState"],
    [9, 48, 4, "turncoatMonths"],
    [11, 7, 0, "infiltrationMonths"],
    [11, 8, 3, "infiltration"],
  ] as const)
    effect(
      id,
      (before.read(base + relative, 1) & mask) >> shift,
      (after.read(base + relative, 1) & mask) >> shift,
    );
  for (const [relative, id] of [
    [17, "faction"],
    [19, "originFaction"],
  ] as const) {
    // Pending custom rows use zero placeholders, not existing faction membership.
    const oldValue = before.officer(index).role === 255 ? 255 : before.read(base + relative, 1);
    const newValue = after.read(base + relative, 1);
    const faction = (value: number) => (value < 21 || value === 255 ? names.faction(value) : value);
    if (oldValue !== newValue)
      append(`${prefix}.${index}.${id}`, group, id, faction(oldValue), faction(newValue));
  }
  for (const [shift, id, labels] of [
    [0, "weapon", ["infantry", "warhorses", "crossbows", "heavyCrossbows"]],
    [2, "ship", ["noShip", "heavyWarships", "mediumWarships", "lightWarships"]],
  ] as const) {
    const oldValue = (before.read(base + 10, 1) >> shift) & 3;
    const newValue = (after.read(base + 10, 1) >> shift) & 3;
    if (oldValue !== newValue)
      append(
        `${prefix}.${index}.${id}`,
        group,
        id,
        message(`san3.${labels[oldValue]}`),
        message(`san3.${labels[newValue]}`),
      );
  }
  if ((before.read(base + 9, 1) & 64) !== 0) {
    const kind = before.read(base + 26, 1);
    append(
      `${prefix}.${index}.task`,
      group,
      "task.kind",
      kind <= 8 ? message(`san3.taskKind${kind}`) : message("editor.unknownValue", { value: kind }),
      message("san3.taskKind255"),
    );
    effect("task.totalMonths", before.read(base + 27, 1) & 15, 0);
    effect("task.elapsedMonths", before.read(base + 27, 1) >> 4, 0);
    if (kind < 8)
      effect(
        "task.effect",
        kind === 1 || kind === 7 ? before.read(base + 29, 1) : before.read(base + 28, 2),
        0,
      );
    if (kind === 7) {
      const city = before.read(base + 28, 1);
      append(
        `${prefix}.${index}.task.targetCity`,
        group,
        "task.targetCity",
        city < 46 ? names.city(city) : message("editor.unknownValue", { value: city }),
        message("san3.none"),
      );
    }
  }
}
