import { message } from "../../shared/messages.ts";
import type { San3Document } from "./document.ts";
import type { San3Field } from "./fields.ts";

/** Strategic officer traits use masked writes; adjacent flags are independent state. */
export function officerTraitFields(document: San3Document, index: number): San3Field[] {
  const offset = document.offset("officers", index);
  const available = document.officer(index).available;
  const flags = document.read(offset + 8, 1);
  const assigned = (document.read(offset + 9, 1) & 0x40) !== 0;
  return (
    [
      ["ambition", 6, 15, 4, 15],
      ["luck", 6, 15, 0, 15],
      ["composure", 7, 15, 4, 15],
      ["bravery", 7, 15, 0, 15],
      // The native lifespan getter masks 0x70, preserving bit7 and the low nibble.
      ["lifespan", 10, 7, 4, 7],
      ["compatibility", 13, 255, 0, 150],
      ["morality", 14, 255, 0, 100],
      // Annual service increments saturate at255; prior service uses the same representation.
      ["serviceYears", 18, 255, 0, 255],
      ["originServiceYears", 20, 255, 0, 255],
      ["actionComplete", 8, 1, 0, 1],
    ] as const
  ).map(([id, relative, mask, shift, max]) => {
    const value = (document.read(offset + relative, 1) >> shift) & mask;
    return {
      key: `officer.${index}.${id}`,
      label: message(`san3.${id}`),
      group: message("san3.officerTraits"),
      columnId: id,
      offset: offset + relative,
      width: 1,
      value,
      min: 0,
      max,
      ...(mask < 255 ? { mask, shift } : {}),
      // Personality and service are independent stored values, even for inactive records.
      // The action bit participates in command execution and has a separate boundary.
      readonly: id === "actionComplete" && (!available || (flags & 0x14) !== 0 || assigned),
      ...(id === "actionComplete"
        ? { boolean: true, help: message("san3.actionCompleteHelp") }
        : {}),
      ...(id === "lifespan" ? { help: message("san3.lifespanHelp") } : {}),
      ...(id === "serviceYears" || id === "originServiceYears"
        ? { help: message("san3.serviceYearsHelp") }
        : {}),
    };
  });
}
