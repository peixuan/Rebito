import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import { San3Document } from "./document.ts";
import { abandonSan3City } from "./governance-abandon.ts";
import { transferSan3City } from "./governance-ownership.ts";
import { san3OperationLabels, san3OperationPreview } from "./operation-preview.ts";

/** A territory transfer includes every affected allegiance and disbanding effect. */
export function san3TerritoryDraft(document: San3Document, changes: Record<string, number>) {
  const requests = new Map<number, { faction?: number; governor?: number }>();
  for (const [key, value] of Object.entries(changes)) {
    const match = /^ownership\.(0|[1-9]\d?)\.(faction|governor)$/.exec(key);
    if (!match || !Number.isSafeInteger(value))
      throw new EditorError("invalid_edit", message("san3.invalidGovernance"));
    const index = Number(match[1]);
    requests.set(index, { ...requests.get(index), [match[2] as string]: value });
  }
  let current = document;
  const intents: Record<string, number> = {};
  const { append, preview } = san3OperationPreview();
  for (const [city, request] of [...requests].sort(([a], [b]) => a - b)) {
    const previous = current.city(city).faction;
    if (request.faction === previous && request.governor === undefined) continue;
    if (request.faction === undefined)
      throw new EditorError("invalid_edit", message("san3.invalidGovernance"));
    if (request.faction === 255 && request.governor !== undefined)
      throw new EditorError("invalid_edit", message("san3.invalidGovernance"));
    const { change, bytes } =
      request.faction === 255
        ? abandonSan3City(current, city)
        : transferSan3City(current, city, request.faction, request.governor);
    const names = san3OperationLabels(current);
    const key = `ownership.${city}.faction`;
    intents[key] = request.faction;
    append(
      key,
      names.city(city),
      "transferCity",
      names.faction(previous),
      names.faction(request.faction),
    );
    if (request.governor !== undefined) {
      intents[`ownership.${city}.governor`] = request.governor;
      append(
        `ownership.${city}.governor`,
        names.city(city),
        "incomingGovernor",
        message("san3.none"),
        names.officer(request.governor),
      );
    }
    const next = new San3Document(bytes);
    if ("cancelledJointAgreements" in change)
      for (const faction of change.cancelledJointAgreements)
        append(
          `ownership.${city}.contract${faction}.joint`,
          names.faction(faction),
          "cancelledJoint",
          1,
          0,
        );
    const affected = "allegiances" in change ? change.allegiances : change.officers;
    for (const entry of affected) {
      const beforeBase = current.offset("officers", entry.index);
      for (const [id, relative] of [
        ["faction", 17],
        ["loyalty", 15],
        ["serviceYears", 18],
        ["originFaction", 19],
        ["originServiceYears", 20],
      ] as const) {
        const before = current.read(beforeBase + relative, 1);
        const after = next.read(beforeBase + relative, 1);
        if (before !== after)
          append(
            `ownership.${city}.${entry.index}.${id}`,
            names.officer(entry.index),
            id,
            id.endsWith("Faction") || id === "faction" ? names.faction(before) : before,
            id.endsWith("Faction") || id === "faction" ? names.faction(after) : after,
          );
      }
      const officer = entry.index;
      const flagOffset = current.offset("officers", officer) + 8;
      append(
        `ownership.${city}.${officer}.actionComplete`,
        names.officer(officer),
        "actionComplete",
        current.read(flagOffset, 1) & 1,
        next.read(flagOffset, 1) & 1,
      );
      for (const id of ["soldiers", "training", "morale", "role", "city"] as const) {
        const before = current.officer(officer)[id];
        const after = next.officer(officer)[id];
        if (before === after) continue;
        append(
          `ownership.${city}.${officer}.${id}`,
          names.officer(officer),
          id === "city" ? "location" : id,
          id === "city"
            ? names.city(before)
            : id === "role"
              ? message(`san3.role${before}`)
              : before,
          id === "city" ? names.city(after) : id === "role" ? message(`san3.role${after}`) : after,
        );
      }
    }
    const affectedCities = new Set([
      city,
      ...affected.map(({ index }) => current.officer(index).city),
    ]);
    for (const index of affectedCities) {
      const base = current.offset("cities", index);
      for (const [id, relative, width] of [
        ["advisor", 10, 2],
        ["delegation", 23, 1],
      ] as const) {
        const mask = id === "delegation" ? 3 : 65535;
        const before = current.read(base + relative, width) & mask;
        const after = next.read(base + relative, width) & mask;
        if (before !== after)
          append(
            `ownership.${city}.city${index}.${id}`,
            names.city(index),
            id,
            id === "advisor" ? names.officer(before) : before,
            id === "advisor" ? names.officer(after) : after,
          );
      }
    }
    current = next;
  }
  return { bytes: current.copy(), changes: intents, preview };
}
