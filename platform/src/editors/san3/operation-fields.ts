import { message } from "../../shared/messages.ts";
import type { EditorField } from "../types.ts";
import { type San3Document, san3Layout } from "./document.ts";
import { inspectSan3Lists, relocateSan3Officers } from "./relocation.ts";
import { succeedSan3Ruler } from "./ruler-change.ts";

/** Eligibility is determined by the same structural validator used when publishing. */
export function san3OperationFields(
  document: San3Document,
  module: string,
  index: number,
): EditorField[] {
  if (module !== "officers" && module !== "factions") return [];
  const cities = Array.from({ length: san3Layout.cities.count }, (_, value) => ({
    value,
    label: document.city(value).name || message("san3.cityRecord", { index: value + 1 }),
  }));
  if (module === "officers") {
    const current = document.officer(index).city;
    let readonly = false;
    try {
      relocateSan3Officers(document, [index], current === 0 ? 1 : 0);
    } catch {
      readonly = true;
    }
    return [
      {
        key: `move.${index}.city`,
        columnId: "moveTo",
        label: message("san3.moveTo"),
        group: message("san3.relocation"),
        value: current,
        min: 0,
        max: 45,
        choices: cities,
        readonly,
        help: message("san3.relocationHelp"),
      },
    ];
  }
  const ruler = document.faction(index).ruler;
  if (ruler === 0xffff) return [];
  const name = (value: number) => ({
    value,
    label: document.officer(value).name || message("san3.officerRecord", { index: value + 1 }),
  });
  const choices = [name(ruler)];
  try {
    const { membership, cities: lists } = inspectSan3Lists(document);
    for (const [candidate, member] of membership) {
      if (member.kind !== "serving" || lists[member.city]?.faction !== index) continue;
      if (candidate === ruler) continue;
      try {
        succeedSan3Ruler(document, index, candidate);
        choices.push(name(candidate));
      } catch {
        /* Unsafe successors remain unavailable; publication rechecks the same rules. */
      }
    }
  } catch {
    /* A malformed graph remains inspectable through the read-only context. */
  }
  return [
    {
      key: `ruler.${index}.officer`,
      columnId: "replaceRuler",
      label: message("san3.replaceRuler"),
      group: message("san3.succession"),
      value: ruler,
      min: 0,
      max: 599,
      choices,
      readonly: choices.length < 2,
      help: message("san3.rulerChangeHelp"),
    },
  ];
}
