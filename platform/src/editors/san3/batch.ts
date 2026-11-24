import { message } from "../../shared/messages.ts";
import { EditorError, type EditorField } from "../types.ts";
import { customMetadataFields } from "./custom-fields.ts";
import { San3Document, san3Layout } from "./document.ts";
import { san3FactionControlFields } from "./faction-control.ts";
import { attributeFields, cityFields, officerFields } from "./fields.ts";
import { san3OperationFields } from "./operation-fields.ts";
import { editSan3Campaign } from "./operations.ts";
import { editSan3Presets, presetFields, San3PresetDocument, san3PresetLayout } from "./presets.ts";

export type San3BatchKind = "city" | "officer" | "custom" | "preset" | "faction";
const invalid = () => new EditorError("invalid_edit", message("editor.invalidEdit"));
const counts = {
  city: san3Layout.cities.count,
  officer: san3Layout.officers.count,
  custom: san3Layout.custom.count,
  preset: san3PresetLayout.count,
  faction: san3Layout.factions.count,
};

/** Expand explicit numeric changes; validation succeeds for every record or none. */
export function expandSan3Batch(
  document: San3Document | San3PresetDocument,
  changes: Record<string, number>,
  sourceKind: San3BatchKind,
  sourceIndex: number,
  targets: number[],
): Record<string, number> {
  const count = counts[sourceKind];
  const validIndex = (index: number) => Number.isInteger(index) && index >= 0 && index < count;
  if (
    !Object.hasOwn(counts, sourceKind) ||
    !validIndex(sourceIndex) ||
    !Array.isArray(targets) ||
    targets.length < 1 ||
    targets.length >= count ||
    new Set(targets).size !== targets.length ||
    targets.some((index) => !validIndex(index) || index === sourceIndex)
  )
    throw invalid();

  function fields(index: number, draft: Record<string, number>): EditorField[] {
    if (sourceKind === "preset") {
      if (!(document instanceof San3PresetDocument)) throw invalid();
      return presetFields(document, index);
    }
    if (!(document instanceof San3Document)) throw invalid();
    if (sourceKind === "city") return cityFields(document, index);
    if (sourceKind === "faction") return san3FactionControlFields(document, index);
    if (sourceKind === "officer")
      return [
        ...officerFields(document, index),
        ...san3OperationFields(document, "officers", index),
      ];
    return [
      ...attributeFields(document, san3Layout.historical.count + index),
      ...customMetadataFields(document, index, draft),
    ];
  }

  const source = fields(sourceIndex, changes).filter(
    (field) => Object.hasOwn(changes, field.key) && changes[field.key] !== field.value,
  );
  if (!source.length) throw new EditorError("no_changes", message("editor.noChanges"));
  if (source.some((field) => field.readonly)) throw invalid();
  const expanded = { ...changes };
  for (const index of targets) {
    const candidates = fields(index, expanded);
    for (const field of source) {
      const target = candidates.find((candidate) => candidate.columnId === field.columnId);
      if (!target || target.readonly) throw invalid();
      expanded[target.key] = changes[field.key] as number;
    }
  }
  // These helpers validate complete final dates, troop limits and creation budgets.
  // Their owned output buffers are discarded; this function only returns draft intents.
  if (document instanceof San3PresetDocument) editSan3Presets(document, expanded);
  else editSan3Campaign(document, expanded);
  return expanded;
}
