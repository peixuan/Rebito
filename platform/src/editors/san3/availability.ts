import { message } from "../../shared/messages.ts";
import type { EditorUnavailableField, EditorView } from "../types.ts";
import { san3TaskValues } from "./task-rules.ts";

function features(
  group: string,
  reason: string,
  fields: readonly (string | readonly [string, string])[],
) {
  return fields.map((field): EditorUnavailableField => {
    const [id, label] = typeof field === "string" ? [field, field] : field;
    return {
      id,
      label: message(`san3.${label}`),
      group: message(`san3.${group}`),
      reason: message(`san3.unavailable.${reason}`),
    };
  });
}

const appearance = features("appearanceSchedule", "appearance", [
  "appearanceYear",
  "appearanceOffset",
]);
const catalog: Record<string, EditorUnavailableField[]> = {
  cities: [
    ...features("governance", "relationships", ["transferCity"]),
    ...features("governance", "neutralCity", ["incomingGovernor"]),
    ...features("shipbuilding", "shipbuilding", [
      ["heavy", "shipbuildingHeavy"],
      ["medium", "shipbuildingMedium"],
      ["light", "shipbuildingLight"],
    ]),
  ],
  officers: [
    ...features("treasures", "inventory", ["bookCopies"]),
    ...features(
      "tasks",
      "tasks",
      san3TaskValues.map((id) => [id, `task.${id}`] as const),
    ),
    ...features("tasks", "joining", [["joinGroup", "taskJoin"]]),
    ...features("lifecycle", "relationships", [
      "recoveryMonths",
      "infiltrationMonths",
      "originFaction",
      "rebellionFaction",
    ]),
    ...features("infiltrationOperations", "infiltration", [
      ["deployCity", "deployInfiltrator"],
      ["establishFaction", "establishInfiltration"],
      ["priorServiceYears", "infiltrationPriorService"],
      ["end", "endInfiltration"],
    ]),
    ...appearance,
  ],
  custom: appearance,
  factions: [
    ...features("succession", "activeFaction", ["replaceRuler"]),
    ...features("governance", "relationships", ["mergeFaction"]),
    ...features("turnOrder", "turnOrder", ["turnPosition", "turnState"]),
    ...features("founding", "unusedFaction", ["foundingFounder", "foundingControl"]),
  ],
};

/** Fill presentation gaps only. No fabricated RAM values, write keys or validation overrides. */
export function san3Availability(view: EditorView): EditorView {
  const present = new Set(view.fields.map(({ columnId }) => columnId));
  const unavailableFields = (catalog[view.module] ?? []).filter(({ id }) => !present.has(id));
  if (view.module === "factions" && !view.fields.some(({ key }) => key.startsWith("diplomacy.")))
    unavailableFields.push(...features("diplomacy", "diplomacy", ["alliance", "hostility"]));
  return { ...view, unavailableFields };
}
