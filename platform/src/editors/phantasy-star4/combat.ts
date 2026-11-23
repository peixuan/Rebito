import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import type { PhantasyStar4Document } from "./document.ts";
import type { EquipmentBonuses } from "./rules.ts";

export const attributes = ["strength", "mental", "agility", "dexterity"] as const;
const invalid = () => new EditorError("invalid_edit", message("editor.invalidEdit"));
export const combatTargets = [
  ["attack", "strength", 0x24],
  ["defence", "agility", 0x28],
  ["magicDefence", "mental", 0x2c],
] as const;

/** Missing rules or unknown equipped IDs leave advanced fields unavailable. */
export function equipmentBonuses(document: PhantasyStar4Document, index: number) {
  const base = document.personOffset(index);
  const total: EquipmentBonuses = {
    strength: 0,
    mental: 0,
    agility: 0,
    dexterity: 0,
    attack: 0,
    defence: 0,
    magicDefence: 0,
  };
  const mutable = { ...total };
  for (let slot = 0; slot < 4; slot++) {
    const item = document.rules?.equipment[document.read(base + 0x4c + slot)];
    if (!item) return;
    for (const key of Object.keys(mutable) as (keyof EquipmentBonuses)[]) mutable[key] += item[key];
  }
  return mutable;
}

/** Preserve target intents for replay even if their underlying base was already correct. */
export function expandCombatTargets(
  document: PhantasyStar4Document,
  changes: Record<string, number>,
) {
  for (const [key, value] of Object.entries(changes)) {
    const match = /^person\.(0|[1-9]\d?)\.(attack|defence|magicDefence)$/.exec(key);
    if (!match) continue;
    const index = Number(match[1]);
    const target = combatTargets.find(([id]) => id === match[2]);
    const bonus = equipmentBonuses(document, index);
    if (!target || !bonus || !Number.isSafeInteger(value) || value < 0 || value > 65535)
      throw invalid();
    const [stat, attribute] = target;
    const base = value - bonus[stat] - bonus[attribute];
    const baseKey = `person.${index}.${attribute}`;
    if (base < 0 || base > 255) throw invalid();
    if (changes[baseKey] !== undefined && changes[baseKey] !== base)
      throw new EditorError(
        "invalid_edit",
        message("phantasyStar4.targetConflict", {
          attribute: message(`phantasyStar4.${attribute}`),
        }),
      );
    changes[baseKey] = base;
  }
}

/** Include recalculated display values in previews without turning them into writable intents. */
export function combatEffects(before: PhantasyStar4Document, after: PhantasyStar4Document) {
  const result = [];
  for (let index = 0; index < 11; index++) {
    const base = before.personOffset(index);
    for (const [stat, offset, width, modified] of [
      ...attributes.map((stat, slot) => [stat, 0x19 + slot * 3, 1, true] as const),
      ...combatTargets.map(([stat, , offset]) => [stat, offset, 2, false] as const),
    ]) {
      const previous = before.read(base + offset, width);
      const current = after.read(base + offset, width);
      if (previous === current) continue;
      result.push({
        key: `${modified ? "modified" : "person"}.${index}.${stat}`,
        label: message("editor.columnLabel", {
          group: message(`phantasyStar4.characters.${index}`),
          field: modified
            ? message("phantasyStar4.equippedAttribute", {
                attribute: message(`phantasyStar4.${stat}`),
              })
            : message(`phantasyStar4.${stat}`),
        }),
        before: previous,
        after: current,
      });
    }
  }
  return result;
}

/** Recompute normal equipment caches without touching battle-specific copies. */
export function refreshAttributes(
  document: PhantasyStar4Document,
  output: Uint8Array,
  index: number,
) {
  const bonus = equipmentBonuses(document, index);
  if (!bonus) throw invalid();
  const base = document.personOffset(index);
  const modified = attributes.map((attribute, slot) => {
    const value = (output[base + 0x18 + slot * 3] as number) + bonus[attribute];
    output[base + 0x19 + slot * 3] = Math.max(0, Math.min(255, value));
    return value;
  });
  const data = new DataView(output.buffer);
  for (const [attribute, relative, source] of [
    ["attack", 0x24, 0],
    ["defence", 0x28, 2],
    ["magicDefence", 0x2c, 1],
  ] as const)
    data.setUint16(base + relative, (modified[source] as number) + bonus[attribute]);
}
