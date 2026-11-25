import { type DisplayText, message } from "../../shared/messages.ts";
import type { EditorView } from "../types.ts";

const groups: Record<string, string[]> = {
  cities: [
    "resources",
    "cityEconomy",
    "cityEquipment",
    "governance",
    "shipbuilding",
    "cityPrices",
    "context",
  ],
  officers: [
    "baseAttributes",
    "officer",
    "officerTraits",
    "appointments",
    "relocation",
    "presenceChanges",
    "personalTreasures",
    "treasures",
    "tasks",
    "lifecycle",
    "infiltrationOperations",
    "lifeChanges",
    "appearanceSchedule",
    "context",
    "historicalContext",
  ],
  custom: ["baseAttributes", "customProfile", "presenceChanges", "appearanceSchedule"],
  factions: [
    "factionSettings",
    "turnOrder",
    "succession",
    "founding",
    "governance",
    "diplomacy",
    "context",
    "factionContext",
  ],
};

/** Common edits precede operations and read-only reference data; nothing is collapsed. */
export function san3FieldLayout(view: EditorView): EditorView {
  const fieldGroupOrder: DisplayText[] = (groups[view.module] ?? []).map((id) =>
    message(`san3.${id}`),
  );
  if (view.module === "factions")
    fieldGroupOrder.splice(
      5,
      0,
      ...view.fields
        .filter((field) => field.columnId.startsWith("alliance."))
        .map((field) => field.group),
    );
  return {
    ...view,
    fieldGroupOrder,
    fields: view.fields.map((field) =>
      view.module === "factions" && ["factionControl", "factionIcon"].includes(field.columnId)
        ? { ...field, group: message("san3.factionSettings") }
        : field,
    ),
  };
}
