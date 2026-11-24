import { message } from "../../shared/messages.ts";
import type { EditorField } from "../types.ts";
import { San3Document } from "./document.ts";
import { invalidGovernance } from "./governance-core.ts";
import { removeSan3Officer, reviveSan3Officer } from "./governance-life.ts";
import { san3OperationLabels, san3OperationPreview } from "./operation-preview.ts";
import { appendSan3PlacementEffects } from "./placement-preview.ts";
import { inspectSan3Treasures } from "./treasures.ts";

const defaultCity = (document: San3Document, index: number) => {
  const city = document.officer(index).city;
  return city < 46 ? city : 0;
};

/** Canonical death/revival intents remain separate from their dependent effects. */
export function editSan3Life(document: San3Document, draft: Record<string, number>) {
  const requests = new Map<number, { dead: number; city: number }>();
  for (const [key, value] of Object.entries(draft)) {
    const match = /^life\.(0|[1-9]\d{0,2})\.(dead|city)$/.exec(key);
    if (!match || !Number.isSafeInteger(value)) throw invalidGovernance();
    const index = Number(match[1]);
    const base = document.offset("officers", index);
    const request = requests.get(index) ?? {
      dead: (document.read(base + 8, 1) >> 4) & 1,
      city: defaultCity(document, index),
    };
    if (value < 0 || value > (match[2] === "dead" ? 1 : 45)) throw invalidGovernance();
    request[match[2] as "dead" | "city"] = value;
    requests.set(index, request);
  }
  let current = document;
  const changes: Record<string, number> = {};
  const { preview, append } = san3OperationPreview();
  const names = san3OperationLabels(document);
  for (const [index, request] of [...requests].sort(([a], [b]) => a - b)) {
    const base = current.offset("officers", index);
    const dead = (current.read(base + 8, 1) >> 4) & 1;
    if (dead === request.dead) continue;
    const key = `life.${index}.dead`;
    changes[key] = request.dead;
    append(key, names.officer(index), "dead", dead, request.dead);
    if (request.dead) {
      const result = removeSan3Officer(current, index);
      const change = result.change;
      append(
        `lifeEffect.${index}.roster`,
        names.officer(index),
        "rosterMembership",
        names.city(change.city),
        message("san3.none"),
      );
      append(
        `lifeEffect.${index}.soldiers`,
        names.officer(index),
        "retiredSoldiers",
        change.soldiersRemoved,
        0,
      );
      if (change.items.length || change.copies)
        append(
          `lifeEffect.${index}.belongings`,
          names.officer(index),
          "belongingsRecipient",
          names.officer(index),
          names.officer(change.recipient),
        );
      const inventory = inspectSan3Treasures(current);
      for (const item of inventory.items.filter((item) => change.items.includes(item.index)))
        preview.push({
          key: `lifeEffect.${index}.treasure.${item.index}`,
          label: message("editor.columnLabel", {
            group: names.officer(index),
            field: item.name || message("san3.treasureRecord", { index: item.index + 1 }),
          }),
          before: names.officer(index),
          after: names.officer(change.recipient),
        });
      append(`lifeEffect.${index}.books`, names.officer(index), "bookCopies", change.copies, 0);
      if (change.advisorRemoved)
        append(
          `lifeEffect.${index}.advisor`,
          names.city(change.city),
          "advisor",
          names.officer(index),
          message("san3.none"),
        );
      current = new San3Document(result.bytes);
    } else {
      const result = reviveSan3Officer(current, index, request.city);
      const cityKey = `life.${index}.city`;
      changes[cityKey] = request.city;
      append(
        cityKey,
        names.officer(index),
        "revivalCity",
        message("san3.none"),
        names.city(request.city),
      );
      append(
        `lifeEffect.${index}.role`,
        names.officer(index),
        "role",
        message("san3.dead"),
        message("san3.role5"),
      );
      const revived = new San3Document(result.bytes);
      appendSan3PlacementEffects(current, revived, index, "lifeEffect", append);
      current = revived;
    }
  }
  return { bytes: current.copy(), changes, preview };
}

/** Broken relationships stay readable; neither control can bypass domain validation. */
export function san3LifeFields(
  document: San3Document,
  index: number,
  draft: Record<string, number> = {},
): EditorField[] {
  const dead = (document.read(document.offset("officers", index) + 8, 1) >> 4) & 1;
  const city = draft[`life.${index}.city`] ?? defaultCity(document, index);
  let eligible = false;
  try {
    if (dead) reviveSan3Officer(document, index, city);
    else removeSan3Officer(document, index);
    eligible = true;
  } catch {
    /* Preserve readable status while an explicit prerequisite is unresolved. */
  }
  const names = san3OperationLabels(document);
  return [
    {
      key: `life.${index}.dead`,
      columnId: "dead",
      label: message("san3.dead"),
      group: message("san3.lifeChanges"),
      value: draft[`life.${index}.dead`] ?? dead,
      min: 0,
      max: 1,
      boolean: true,
      readonly: !eligible,
      help: message("san3.lifeHelp"),
    },
    {
      key: `life.${index}.city`,
      columnId: "revivalCity",
      label: message("san3.revivalCity"),
      group: message("san3.lifeChanges"),
      value: city,
      min: 0,
      max: 45,
      choices: Array.from({ length: 46 }, (_, value) => ({ value, label: names.city(value) })),
      readonly: !dead || !eligible,
      help: message("san3.revivalHelp"),
    },
  ];
}
