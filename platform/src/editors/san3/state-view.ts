import type { EditorField } from "../types.ts";
import { campaignStateFields, editSan3CampaignState } from "./campaign-state.ts";
import { San3Document, san3Layout } from "./document.ts";
import { san3OperationLabels, san3OperationPreview } from "./operation-preview.ts";

/** Only the selected record is inspected; free agents do not use officer.available. */
export function san3StateFields(document: San3Document, index: number): EditorField[] {
  const names = san3OperationLabels(document);
  try {
    return campaignStateFields(document, index).map((field) => ({
      ...field,
      ...(field.choices
        ? { choices: field.choices.map(({ value }) => ({ value, label: names.faction(value) })) }
        : {}),
    }));
  } catch {
    return [];
  }
}

/** Keep submitted keys canonical while naming the affected officer and dependent state. */
export function san3StateDraft(document: San3Document, changes: Record<string, number>) {
  const result = editSan3CampaignState(document, changes);
  const after = new San3Document(result.bytes);
  const names = san3OperationLabels(document);
  const { append, preview } = san3OperationPreview();
  const touched = new Set<number>();
  const faction = (value: number) =>
    value < san3Layout.factions.count || value === 255 ? names.faction(value) : value;
  for (const [key, value] of Object.entries(result.changes)) {
    const index = Number(key.split(".")[1]);
    const field = campaignStateFields(document, index).find((candidate) => candidate.key === key);
    if (!field) continue;
    const named = field.columnId.endsWith("Faction");
    append(
      key,
      names.officer(index),
      field.columnId,
      named ? faction(field.value) : field.value,
      named ? faction(value) : value,
    );
    touched.add(index);
  }
  for (const index of touched) {
    const base = document.offset("officers", index);
    for (const [relative, mask, shift, id] of [
      [9, 8, 3, "recoveryState"],
      [8, 8, 3, "rebellion"],
    ] as const) {
      const beforeValue = (document.read(base + relative, 1) & mask) >> shift;
      const afterValue = (after.read(base + relative, 1) & mask) >> shift;
      if (beforeValue !== afterValue)
        append(`stateEffect.${index}.${id}`, names.officer(index), id, beforeValue, afterValue);
    }
    const beforeOrigin = document.read(base + 19, 1);
    const afterOrigin = after.read(base + 19, 1);
    if (
      beforeOrigin !== afterOrigin &&
      result.changes[`state.${index}.originFaction`] === undefined
    )
      append(
        `stateEffect.${index}.originFaction`,
        names.officer(index),
        "originFaction",
        faction(beforeOrigin),
        faction(afterOrigin),
      );
  }
  return { bytes: result.bytes, changes: result.changes, preview };
}
