import { message } from "../../shared/messages.ts";
import type { EditorField } from "../types.ts";
import { San3Document, san3Layout } from "./document.ts";
import { inspectSan3Governance, invalidGovernance } from "./governance-core.ts";
import { mergeSan3Factions } from "./governance-merge.ts";
import { san3OperationLabels, san3OperationPreview } from "./operation-preview.ts";

export function san3MergeFields(document: San3Document, index: number): EditorField[] {
  try {
    inspectSan3Governance(document);
  } catch {
    return [];
  }
  const names = san3OperationLabels(document);
  return [
    {
      key: `merge.${index}.faction`,
      columnId: "mergeFaction",
      label: message("san3.mergeFaction"),
      group: message("san3.governance"),
      value: index,
      min: 0,
      max: 20,
      choices: Array.from({ length: san3Layout.factions.count }, (_, value) => value)
        .filter((value) => document.faction(value).active)
        .map((value) => ({ value, label: names.faction(value) })),
      readonly:
        !document.faction(index).active ||
        document.read(0x7dc22, 4) === document.offset("factions", index),
      help: message("san3.mergeFactionHelp"),
    },
  ];
}

/** Absorption previews territory, allegiance, control and cancelled faction contracts. */
export function san3MergeDraft(document: San3Document, changes: Record<string, number>) {
  let current = document;
  const intents: Record<string, number> = {};
  const { append, preview } = san3OperationPreview();
  for (const [key, target] of Object.entries(changes).sort(([a], [b]) => a.localeCompare(b))) {
    const match = /^merge\.(0|[1-9]\d?)\.faction$/.exec(key);
    if (!match || !Number.isSafeInteger(target)) throw invalidGovernance();
    const source = Number(match[1]);
    current.offset("factions", source);
    current.offset("factions", target);
    if (source === target) continue;
    const { change, bytes } = mergeSan3Factions(current, source, target);
    const next = new San3Document(bytes);
    const names = san3OperationLabels(current);
    const group = names.faction(source);
    const prefix = `merge.${source}`;
    intents[key] = target;
    append(key, group, "mergeFaction", group, names.faction(target));
    for (const city of change.cities) {
      append(`${prefix}.city${city}`, names.city(city), "faction", group, names.faction(target));
      const offset = current.offset("cities", city) + 23;
      append(
        `${prefix}.city${city}.delegation`,
        names.city(city),
        "delegation",
        current.read(offset, 1) & 3,
        next.read(offset, 1) & 3,
      );
    }
    for (const { index, before, after } of change.allegiances) {
      append(
        `${prefix}.officer${index}.faction`,
        names.officer(index),
        "faction",
        names.faction(before.faction),
        names.faction(after.faction),
      );
      for (const [id, field] of [
        ["loyalty", "loyalty"],
        ["service", "serviceYears"],
        ["originService", "originServiceYears"],
      ] as const)
        append(
          `${prefix}.officer${index}.${id}`,
          names.officer(index),
          field,
          before[id],
          after[id],
        );
      if (before.originFaction !== after.originFaction)
        append(
          `${prefix}.officer${index}.origin`,
          names.officer(index),
          "originFaction",
          names.faction(before.originFaction),
          names.faction(after.originFaction),
        );
    }
    append(
      `${prefix}.rulerRole`,
      names.officer(change.formerRuler),
      "role",
      message("san3.role0"),
      message(`san3.role${change.formerRulerRole}`),
    );
    append(
      `${prefix}.control`,
      names.faction(target),
      "playerControl",
      change.controlBefore,
      change.controlAfter,
    );
    for (const state of change.cleanup) {
      for (const [id, value] of [
        ["rebellion", state.rebellion],
        ["turncoatMonths", state.turncoat],
        ["infiltration", state.infiltration & 8 ? 1 : 0],
        ["infiltrationMonths", state.infiltration & 7],
      ] as const)
        append(`${prefix}.cleanup${state.index}.${id}`, names.officer(state.index), id, value, 0);
      append(
        `${prefix}.cleanup${state.index}.originFaction`,
        names.officer(state.index),
        "originFaction",
        group,
        message("san3.none"),
      );
      const base = current.offset("officers", state.index);
      append(
        `${prefix}.cleanup${state.index}.originService`,
        names.officer(state.index),
        "originServiceYears",
        current.read(base + 20, 1),
        0,
      );
    }
    for (const contract of change.diplomacy)
      for (const [id, label] of [
        ["alliance", "cancelledAlliance"],
        ["joint", "cancelledJoint"],
        ["targetReference", "cancelledTargetReference"],
      ] as const)
        if (contract[id])
          append(
            `${prefix}.contract${contract.faction}.${id}`,
            names.faction(contract.faction),
            label,
            1,
            0,
          );
    current = next;
  }
  return { bytes: current.copy(), changes: intents, preview };
}
