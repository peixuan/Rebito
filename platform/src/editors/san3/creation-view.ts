import { message } from "../../shared/messages.ts";
import type { EditorField } from "../types.ts";
import { San3Document, san3Layout } from "./document.ts";
import { invalidGovernance } from "./governance-core.ts";
import { createSan3Faction, san3FactionFounders } from "./governance-creation.ts";
import { san3OperationLabels, san3OperationPreview } from "./operation-preview.ts";
import { appendSan3PlacementEffects } from "./placement-preview.ts";

/** Zero cancels founding; other selector values are officer IDs plus one. */
export function san3CreationFields(
  document: San3Document,
  index: number,
  draft: Record<string, number> = {},
): EditorField[] {
  if (document.faction(index).active) return [];
  let candidates: number[] = [];
  try {
    candidates = san3FactionFounders(document, index);
  } catch {
    /* Keep malformed or currently unavailable slots readable, with no actionable choices. */
  }
  const names = san3OperationLabels(document);
  const key = `founding.${index}.founder`;
  const group = message("san3.founding");
  return [
    {
      key,
      columnId: "foundingFounder",
      label: message("san3.foundingFounder"),
      group,
      value: draft[key] ?? 0,
      min: 0,
      max: 600,
      readonly: !candidates.length,
      help: message("san3.foundingHelp"),
      choices: [
        { value: 0, label: message("san3.none") },
        ...candidates.map((officer) => ({
          value: officer + 1,
          label: message("san3.foundingCandidate", {
            city: names.city(document.officer(officer).city),
            officer: names.officer(officer),
          }),
        })),
      ],
    },
    {
      key: `founding.${index}.human`,
      columnId: "foundingControl",
      label: message("san3.foundingControl"),
      group,
      value: draft[`founding.${index}.human`] ?? 1,
      min: 0,
      max: 1,
      enabledByField: key,
      readonly: !candidates.length,
      choices: [0, 1].map((value) => ({ value, label: message(`san3.factionControl${value}`) })),
    },
  ];
}

function appendCreation(
  before: San3Document,
  after: San3Document,
  change: ReturnType<typeof createSan3Faction>["change"],
  append: ReturnType<typeof san3OperationPreview>["append"],
) {
  const { faction, ruler, city } = change;
  const names = san3OperationLabels(before);
  const nextNames = san3OperationLabels(after);
  const group = message("san3.factionRecord", { index: faction + 1 });
  const prefix = `foundingEffect.${faction}`;
  append(
    `founding.${faction}.founder`,
    group,
    "foundingFounder",
    message("san3.none"),
    names.officer(ruler),
  );
  // Even computer=0 is a required intent: an unused slot has no previous controller.
  append(
    `founding.${faction}.human`,
    group,
    "foundingControl",
    message("san3.inactive"),
    message(`san3.factionControl${change.human}`),
  );
  append(`${prefix}.capital`, group, "capital", message("san3.none"), names.city(city));
  append(
    `${prefix}.owner`,
    names.city(city),
    "faction",
    names.faction(change.previousFaction),
    nextNames.faction(faction),
  );
  append(
    `${prefix}.role`,
    names.officer(ruler),
    "role",
    message(`san3.role${change.previousRole}`),
    message("san3.role0"),
  );
  if (change.previousAdvisor !== change.advisor)
    append(
      `${prefix}.advisor`,
      names.city(city),
      "advisor",
      names.officer(change.previousAdvisor),
      names.officer(change.advisor),
    );
  const cityBase = before.offset("cities", city);
  append(
    `${prefix}.delegation`,
    names.city(city),
    "delegation",
    before.read(cityBase + 23, 1) & 3,
    0,
  );
  append(
    `${prefix}.count`,
    message("san3.factions"),
    "factionCount",
    before.read(0x7878b, 1),
    after.read(0x7878b, 1),
  );
  append(
    `${prefix}.turn`,
    group,
    "foundingFirstTurn",
    message("san3.inactive"),
    change.upcomingPosition === null
      ? message("san3.foundingNextMonth")
      : message("san3.foundingThisMonth", { position: change.upcomingPosition }),
  );
  for (const { index } of change.allegiances)
    appendSan3PlacementEffects(before, after, index, "foundingEffect", append);
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
  for (let other = 0; other < san3Layout.factions.count; other++) {
    if (!before.faction(other).active) continue;
    for (const [source, target] of [
      [faction, other],
      [other, faction],
    ]) {
      if (source === undefined || target === undefined) continue;
      append(
        `${prefix}.hostility${source}.${target}`,
        message("san3.foundingRelation", {
          source: nextNames.faction(source),
          target: nextNames.faction(target),
        }),
        "hostility",
        message("san3.inactive"),
        after.read(after.offset("factions", source) + 15 + target, 1),
      );
    }
  }
}

/** Derive the city from the selected resident, then replay all founding intents atomically. */
export function editSan3Creation(document: San3Document, draft: Record<string, number>) {
  const requests = new Map<number, { founder: number; human: number }>();
  for (const [key, value] of Object.entries(draft)) {
    const match = /^founding\.(0|[1-9]\d?)\.(founder|human)$/.exec(key);
    if (
      !match ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > (match[2] === "human" ? 1 : 600)
    )
      throw invalidGovernance();
    const index = Number(match[1]);
    document.offset("factions", index);
    const request = requests.get(index) ?? { founder: 0, human: 1 };
    request[match[2] as "founder" | "human"] = value;
    requests.set(index, request);
  }
  let current = document;
  const changes: Record<string, number> = {};
  const { append, preview } = san3OperationPreview();
  for (const [faction, request] of [...requests].sort(([a], [b]) => a - b)) {
    if (!request.founder) continue;
    const ruler = request.founder - 1;
    const result = createSan3Faction(current, {
      faction,
      ruler,
      human: request.human,
      city: current.officer(ruler).city,
    });
    const after = new San3Document(result.bytes);
    changes[`founding.${faction}.founder`] = request.founder;
    changes[`founding.${faction}.human`] = request.human;
    appendCreation(current, after, result.change, append);
    current = after;
  }
  return { bytes: current.copy(), changes, preview };
}
