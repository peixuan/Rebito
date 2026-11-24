import { message } from "../../shared/messages.ts";
import { EditorError, type EditorField } from "../types.ts";
import { San3Document, san3Layout } from "./document.ts";
import {
  deploySan3Infiltrator,
  endSan3Infiltration,
  establishSan3Infiltration,
} from "./infiltration.ts";
import { san3OperationLabels, san3OperationPreview } from "./operation-preview.ts";

const invalid = () => new EditorError("invalid_edit", message("editor.invalidEdit"));
const permitted = (operation: () => unknown) => {
  try {
    operation();
    return true;
  } catch {
    return false;
  }
};

/** Zero means no operation; city/faction choices use one-based private selection values. */
export function san3InfiltrationFields(document: San3Document, index: number): EditorField[] {
  try {
    return infiltrationFields(document, index);
  } catch {
    return [];
  }
}

function infiltrationFields(document: San3Document, index: number): EditorField[] {
  const base = document.offset("officers", index);
  const currentFaction = document.read(base + 17, 1);
  const names = san3OperationLabels(document);
  const factions = Array.from(
    { length: san3Layout.factions.count },
    (_, faction) => faction,
  ).filter((faction) => faction !== currentFaction && document.faction(faction).active);
  const cities = Array.from({ length: san3Layout.cities.count }, (_, city) => city).filter((city) =>
    factions.includes(document.city(city).faction),
  );
  const canDeploy =
    cities.length > 0 &&
    permitted(() => deploySan3Infiltrator(document, index, cities[0] as number));
  const canEstablish =
    factions.length > 0 &&
    permitted(() => establishSan3Infiltration(document, index, factions[0] as number));
  const canEnd = permitted(() => endSan3Infiltration(document, index));
  if (!canDeploy && !canEstablish && !canEnd) return [];
  const none = { value: 0, label: message("san3.none") };
  return [
    {
      id: "deployCity",
      label: "deployInfiltrator",
      value: 0,
      max: san3Layout.cities.count,
      enabled: canDeploy,
      choices: [none, ...cities.map((city) => ({ value: city + 1, label: names.city(city) }))],
    },
    {
      id: "establishFaction",
      label: "establishInfiltration",
      value: 0,
      max: san3Layout.factions.count,
      enabled: canEstablish,
      choices: [
        none,
        ...factions.map((faction) => ({ value: faction + 1, label: names.faction(faction) })),
      ],
    },
    {
      id: "priorServiceYears",
      label: "infiltrationPriorService",
      value: 0,
      max: 255,
      enabled: canEstablish,
    },
    {
      id: "end",
      label: "endInfiltration",
      value: 0,
      max: 1,
      enabled: canEnd,
    },
  ].map(({ id, label, value, max, enabled, ...options }) => ({
    key: `infiltration.${index}.${id}`,
    columnId: id,
    group: message("san3.infiltrationOperations"),
    label: message(`san3.${label}`),
    help: message(`san3.${label}Help`),
    value,
    min: 0,
    max,
    readonly: !enabled,
    ...options,
    ...(id === "priorServiceYears"
      ? { enabledByField: `infiltration.${index}.establishFaction` }
      : {}),
    ...(id === "end" ? { boolean: true } : {}),
  }));
}

/** A single coherent covert operation owns the draft; dependent fields are preview effects. */
export function san3InfiltrationDraft(document: San3Document, changes: Record<string, number>) {
  const indices = new Set<number>();
  const values: Record<string, number> = {};
  for (const [key, value] of Object.entries(changes)) {
    const match =
      /^infiltration\.(0|[1-9]\d{0,2})\.(deployCity|establishFaction|priorServiceYears|end)$/.exec(
        key,
      );
    if (!match || !Number.isSafeInteger(value)) throw invalid();
    indices.add(Number(match[1]));
    values[match[2] as string] = value;
  }
  if (!indices.size) return { bytes: document.copy(), changes: {}, preview: [] };
  if (indices.size !== 1) throw invalid();
  const index = [...indices][0] as number;
  const fields = san3InfiltrationFields(document, index);
  if (!fields.length) throw invalid();
  for (const field of fields) {
    const value = values[field.columnId];
    if (value !== undefined && (value < field.min || value > field.max)) throw invalid();
  }
  const active = ["deployCity", "establishFaction", "end"].filter((id) => (values[id] ?? 0) > 0);
  const priorField = fields.find(({ columnId }) => columnId === "priorServiceYears") as EditorField;
  const priorYears = values.priorServiceYears ?? priorField.value;
  if (active.length > 1 || (active[0] !== "establishFaction" && priorYears !== priorField.value))
    throw invalid();
  if (!active.length) return { bytes: document.copy(), changes: {}, preview: [] };
  const operation = active[0] as string;
  const field = fields.find(({ columnId }) => columnId === operation) as EditorField;
  if (field.readonly) throw invalid();
  const selection = values[operation] as number;
  const result =
    operation === "deployCity"
      ? deploySan3Infiltrator(document, index, selection - 1)
      : operation === "establishFaction"
        ? establishSan3Infiltration(document, index, selection - 1, priorYears)
        : endSan3Infiltration(document, index);
  const after = new San3Document(result.bytes);
  const names = san3OperationLabels(document);
  const { append, preview } = san3OperationPreview();
  const group = names.officer(index);
  const intents = { [field.key]: selection };
  append(
    field.key,
    group,
    operation === "deployCity"
      ? "deployInfiltrator"
      : operation === "establishFaction"
        ? "establishInfiltration"
        : "endInfiltration",
    operation === "end" ? 0 : message("san3.none"),
    operation === "end"
      ? 1
      : operation === "deployCity"
        ? names.city(selection - 1)
        : names.faction(selection - 1),
  );
  if (operation === "establishFaction" && priorYears !== priorField.value) {
    intents[priorField.key] = priorYears;
    append(priorField.key, group, "infiltrationPriorService", priorField.value, priorYears);
  }
  const base = document.offset("officers", index);
  for (const [relative, mask, shift, id] of [
    [11, 8, 3, "infiltration"],
    [11, 7, 0, "infiltrationMonths"],
    [12, 255, 0, "role"],
    [15, 255, 0, "loyalty"],
    [16, 255, 0, "city"],
    [17, 255, 0, "faction"],
    [18, 255, 0, "serviceYears"],
    [19, 255, 0, "originFaction"],
    [20, 255, 0, "originServiceYears"],
    [21, 255, 0, "training"],
    [22, 255, 0, "morale"],
  ] as const) {
    const beforeValue = (document.read(base + relative, 1) & mask) >> shift;
    const afterValue = (after.read(base + relative, 1) & mask) >> shift;
    if (beforeValue === afterValue) continue;
    const display = (value: number) =>
      id === "city"
        ? names.city(value)
        : id === "faction" || id === "originFaction"
          ? value < san3Layout.factions.count || value === 255
            ? names.faction(value)
            : value
          : id === "role"
            ? message(`san3.role${value}`)
            : value;
    append(
      `infiltrationEffect.${index}.${id}`,
      group,
      id === "city" ? "location" : id,
      display(beforeValue),
      display(afterValue),
    );
  }
  const sourceCity = document.read(base + 16, 1);
  const city = document.offset("cities", sourceCity);
  if (document.read(city + 10, 2) !== after.read(city + 10, 2))
    append(
      `infiltrationEffect.${index}.advisor`,
      names.city(sourceCity),
      "advisor",
      names.officer(document.read(city + 10, 2)),
      names.officer(after.read(city + 10, 2)),
    );
  return { bytes: result.bytes, changes: intents, preview };
}
