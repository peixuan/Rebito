import { message } from "../../shared/messages.ts";
import type { EditorField } from "../types.ts";
import { inspectSan3CustomAppearance, scheduleSan3CustomAppearance } from "./custom-appearance.ts";
import { San3Document } from "./document.ts";
import { invalidGovernance } from "./governance-core.ts";
import { san3OperationLabels, san3OperationPreview } from "./operation-preview.ts";
import { appendSan3PlacementEffects } from "./placement-preview.ts";

/** Keep the chosen year canonical; dependent retirement and roster effects are not intents. */
export function editSan3Appearance(document: San3Document, draft: Record<string, number>) {
  const requests = Object.entries(draft).map(([key, year]) => {
    const match = /^appearance\.(0|[1-9]\d{0,2})\.year$/.exec(key);
    if (!match || !Number.isSafeInteger(year)) throw invalidGovernance();
    return { key, index: Number(match[1]), year };
  });
  let current = document;
  const changes: Record<string, number> = {};
  const { preview, append } = san3OperationPreview();
  const names = san3OperationLabels(document);
  for (const { key, index, year } of requests.sort((a, b) => a.index - b.index)) {
    const state = inspectSan3CustomAppearance(current, index);
    if (year === (state.scheduledYear ?? 0)) continue;
    const result = scheduleSan3CustomAppearance(current, index, year);
    const changed = new San3Document(result.bytes);
    changes[key] = year;
    append(
      key,
      names.officer(index),
      "appearanceYear",
      state.scheduledYear ?? message("san3.appearanceNotScheduled"),
      year,
    );
    append(
      `appearanceEffect.${index}.offset`,
      names.officer(index),
      "appearanceOffset",
      state.offset,
      year - state.baseYear,
    );
    if (!state.pending)
      append(
        `appearanceEffect.${index}.role`,
        names.officer(index),
        "presenceRole",
        message(`san3.role${result.change.previousRole}`),
        message("san3.appearancePending"),
      );
    if (result.change.previousCity !== 255)
      append(
        `appearanceEffect.${index}.roster`,
        names.officer(index),
        "rosterMembership",
        names.city(result.change.previousCity),
        message("san3.none"),
      );
    appendSan3PlacementEffects(current, changed, index, "appearanceEffect", append);
    if (result.change.advisorRemoved)
      append(
        `appearanceEffect.${index}.advisor`,
        names.city(result.change.previousCity),
        "advisor",
        names.officer(index),
        message("san3.none"),
      );
    current = changed;
  }
  return { bytes: current.copy(), changes, preview };
}

/** Offer a neutral initial choice so the earliest future year is an explicit user action. */
export function san3AppearanceFields(
  document: San3Document,
  index: number,
  draft: Record<string, number> = {},
): EditorField[] {
  let state: ReturnType<typeof inspectSan3CustomAppearance>;
  try {
    state = inspectSan3CustomAppearance(document, index);
  } catch {
    return [];
  }
  const original = state.scheduledYear ?? 0;
  const choices: NonNullable<EditorField["choices"]> = [];
  if (!state.pending || original < state.minYear)
    choices.push({
      value: original,
      label: original ? String(original) : message("san3.appearanceNotScheduled"),
    });
  for (let year = state.minYear; year <= state.maxYear; year++)
    choices.push({ value: year, label: String(year) });
  const group = message("san3.appearanceSchedule");
  const key = `appearance.${index}.year`;
  const selectedYear = draft[key];
  return [
    {
      key,
      columnId: "appearanceYear",
      label: message("san3.appearanceYear"),
      group,
      value: draft[key] ?? original,
      min: 0,
      max: state.maxYear,
      choices,
      help: message("san3.appearanceScheduleHelp"),
    },
    {
      key: `appearanceEffect.${index}.offset`,
      columnId: "appearanceOffset",
      label: message("san3.appearanceOffset"),
      group,
      value: selectedYear ? selectedYear - state.baseYear : state.offset,
      min: 0,
      max: 255,
      readonly: true,
    },
  ];
}
