import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import type { PhantasyStar4Document } from "./document.ts";

export const attributes = ["strength", "mental", "agility", "dexterity"] as const;
const invalid = () => new EditorError("invalid_edit", message("editor.invalidEdit"));

/** Recompute normal equipment caches without touching battle-specific copies. */
export function refreshAttributes(
  document: PhantasyStar4Document,
  output: Uint8Array,
  index: number,
) {
  const rules = document.rules;
  if (!rules) throw invalid();
  const base = document.personOffset(index);
  const equipment = Array.from(output.slice(base + 0x4c, base + 0x50), (id) => {
    const bonus = rules.equipment[id];
    if (!bonus) throw invalid();
    return bonus;
  });
  const modified = attributes.map((attribute, slot) => {
    const value =
      (output[base + 0x18 + slot * 3] as number) +
      equipment.reduce((sum, item) => sum + item[attribute], 0);
    output[base + 0x19 + slot * 3] = Math.max(0, Math.min(255, value));
    return value;
  });
  const data = new DataView(output.buffer);
  for (const [attribute, relative, source] of [
    ["attack", 0x24, 0],
    ["defence", 0x28, 2],
    ["magicDefence", 0x2c, 1],
  ] as const)
    data.setUint16(
      base + relative,
      (modified[source] as number) + equipment.reduce((sum, item) => sum + item[attribute], 0),
    );
}
