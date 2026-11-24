import { message } from "../../shared/messages.ts";
import type { EditorField } from "../types.ts";
import type { San3Document } from "./document.ts";
import { inspectSan3Governance } from "./governance-core.ts";
import { requireSan3GovernorCandidate } from "./governance-governor.ts";

/** Only offer appointments which pass the same graph checks as publication. */
export function san3GovernorFields(document: San3Document, city: number): EditorField[] {
  const current = document.read(document.offset("cities", city) + 4, 2);
  const choice = (value: number) => ({
    value,
    label:
      value === 0xffff
        ? message("san3.none")
        : document.officer(value).name || message("san3.officerRecord", { index: value + 1 }),
  });
  const choices = [choice(current)];
  try {
    for (const candidate of inspectSan3Governance(document).cities[city]?.serving ?? []) {
      if (candidate === current) continue;
      try {
        requireSan3GovernorCandidate(document, city, candidate);
        choices.push(choice(candidate));
      } catch {
        /* Keep unsafe nominations unavailable without hiding readable city data. */
      }
    }
  } catch {
    /* Malformed lists remain inspectable but cannot be rewritten. */
  }
  return [
    {
      key: `governor.${city}.officer`,
      columnId: "appointGovernor",
      label: message("san3.appointGovernor"),
      group: message("san3.governance"),
      value: current,
      min: 0,
      max: 599,
      choices,
      readonly: choices.length < 2,
      help: message("san3.governorHelp"),
    },
  ];
}
