import { message } from "../../shared/messages.ts";
import type { EditorField } from "../types.ts";
import { type San3Document, san3Layout } from "./document.ts";
import { inspectSan3Governance } from "./governance-core.ts";
import { san3OperationLabels } from "./operation-preview.ts";

/** Territory transfers choose identities; list addresses never reach the UI. */
export function san3TerritoryFields(
  document: San3Document,
  module: string,
  index: number,
): EditorField[] {
  if (module !== "cities") return [];
  let graph: ReturnType<typeof inspectSan3Governance>;
  try {
    graph = inspectSan3Governance(document);
  } catch {
    return [];
  }
  const names = san3OperationLabels(document);
  const choices = Array.from({ length: san3Layout.factions.count }, (_, value) => value)
    .filter((value) => document.faction(value).active)
    .map((value) => ({ value, label: names.faction(value) }));
  const city = graph.cities[index];
  if (!city) return [];
  const neutral = city.faction === 255;
  const locked =
    document.read(0x7dc2a, 4) === document.offset("cities", index) ||
    (!neutral && graph.factionCities[city.faction]?.[0] === index);
  const fields: EditorField[] = [
    {
      key: `ownership.${index}.faction`,
      columnId: "transferCity",
      label: message("san3.transferCity"),
      group: message("san3.governance"),
      value: city.faction,
      min: 0,
      max: 255,
      choices: [{ value: 255, label: message("san3.neutralCity") }, ...choices],
      readonly: locked,
      help: message("san3.transferCityHelp"),
    },
  ];
  if (neutral)
    fields.push({
      key: `ownership.${index}.governor`,
      columnId: "incomingGovernor",
      label: message("san3.incomingGovernor"),
      group: message("san3.governance"),
      value: 65535,
      min: 0,
      max: 65535,
      choices: [
        { value: 65535, label: message("san3.none") },
        ...[...graph.membership]
          .filter(
            ([officer, member]) =>
              !graph.rulers.has(officer) &&
              (member.city === index
                ? member.kind !== "serving"
                : member.kind === "serving" && graph.cities[member.city]?.serving[0] !== officer),
          )
          .map(([value]) => ({ value, label: names.officer(value) })),
      ],
      readonly: locked,
      help: message("san3.incomingGovernorHelp"),
    });
  return fields;
}
