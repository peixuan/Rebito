import { message } from "../../shared/messages.ts";
import type { EditorField } from "../types.ts";
import { San3Document } from "./document.ts";
import { invalidGovernance } from "./governance-core.ts";
import { setSan3OfficerPresence } from "./governance-membership.ts";
import { withdrawSan3Officer } from "./governance-withdrawal.ts";
import { san3OperationLabels, san3OperationPreview } from "./operation-preview.ts";
import { appendSan3PlacementEffects } from "./placement-preview.ts";

const placementCity = (document: San3Document, index: number) => {
  const current = document.officer(index).city;
  return current < 46
    ? current
    : (Array.from({ length: 46 }, (_, city) => city).find(
        (city) => document.city(city).faction !== 255,
      ) ?? 0);
};

const roleLabel = (value: number) =>
  value >= 0 && value <= 7
    ? message(`san3.role${value}`)
    : message("editor.unknownValue", { value });

/** Only list operations are canonical intents; army and allegiance effects are derived. */
export function editSan3Presence(document: San3Document, draft: Record<string, number>) {
  const requests = new Map<number, { role: number; city: number }>();
  for (const [key, value] of Object.entries(draft)) {
    const match = /^presence\.(0|[1-9]\d{0,2})\.(role|city)$/.exec(key);
    if (!match || !Number.isSafeInteger(value)) throw invalidGovernance();
    const index = Number(match[1]);
    const officer = document.officer(index);
    const request = requests.get(index) ?? {
      role: officer.role,
      city: placementCity(document, index),
    };
    if (value < 0 || value > (match[2] === "role" ? 7 : 45)) throw invalidGovernance();
    request[match[2] as "role" | "city"] = value;
    requests.set(index, request);
  }
  let current = document;
  const changes: Record<string, number> = {};
  const { preview, append } = san3OperationPreview();
  const names = san3OperationLabels(document);
  for (const [index, request] of [...requests].sort(([a], [b]) => a - b)) {
    if (current.officer(index).role === request.role) continue;
    const result =
      request.role === 7
        ? withdrawSan3Officer(current, index)
        : setSan3OfficerPresence(current, index, request.role, request.city);
    const change = result.change;
    const key = `presence.${index}.role`;
    changes[key] = request.role;
    append(
      key,
      names.officer(index),
      "presenceRole",
      roleLabel(change.previousRole),
      roleLabel(request.role),
    );
    if ("introduced" in change && change.introduced) {
      const cityKey = `presence.${index}.city`;
      changes[cityKey] = request.city;
      append(
        cityKey,
        names.officer(index),
        "appearanceCity",
        message("san3.none"),
        names.city(request.city),
      );
    }
    if (request.role === 7)
      append(
        `presenceEffect.${index}.roster`,
        names.officer(index),
        "rosterMembership",
        names.city(change.city),
        message("san3.none"),
      );
    const placed = new San3Document(result.bytes);
    appendSan3PlacementEffects(current, placed, index, "presenceEffect", append);
    if (change.advisorRemoved)
      append(
        `presenceEffect.${index}.advisor`,
        names.city(change.city),
        "advisor",
        names.officer(index),
        message("san3.none"),
      );
    current = placed;
  }
  return { bytes: current.copy(), changes, preview };
}

/** Keep unsupported roles visible while offering only coherent membership transitions. */
export function san3PresenceFields(
  document: San3Document,
  index: number,
  draft: Record<string, number> = {},
): EditorField[] {
  const current = document.officer(index);
  const city = draft[`presence.${index}.city`] ?? placementCity(document, index);
  const choices = [{ value: current.role, label: roleLabel(current.role) }];
  for (const value of [4, 5, 6, 7]) {
    if (value === current.role) continue;
    try {
      if (value === 7) withdrawSan3Officer(document, index);
      else setSan3OfficerPresence(document, index, value, city);
      choices.push({ value, label: message(`san3.role${value}`) });
    } catch {
      /* Read-only rows remain inspectable, including malformed or dead records. */
    }
  }
  const names = san3OperationLabels(document);
  return [
    {
      key: `presence.${index}.role`,
      columnId: "presenceRole",
      label: message("san3.presenceRole"),
      group: message("san3.presenceChanges"),
      value: draft[`presence.${index}.role`] ?? current.role,
      min: 0,
      max: 7,
      choices,
      readonly: choices.length < 2,
      help: message("san3.presenceHelp"),
    },
    {
      key: `presence.${index}.city`,
      columnId: "appearanceCity",
      label: message("san3.appearanceCity"),
      group: message("san3.presenceChanges"),
      value: city,
      min: 0,
      max: 45,
      choices: Array.from({ length: 46 }, (_, value) => ({ value, label: names.city(value) })),
      readonly: current.role !== 7 || choices.length < 2,
      help: message("san3.appearanceHelp"),
    },
  ];
}
