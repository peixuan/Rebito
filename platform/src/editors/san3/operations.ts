import { type DisplayText, message } from "../../shared/messages.ts";
import { EditorError, type EditorView } from "../types.ts";
import { editSan3Appointments } from "./appointment-draft.ts";
import { san3CampaignWorkflow } from "./campaign-workflows.ts";
import { San3Document, san3Layout } from "./document.ts";
import { san3FactionSettingsWorkflow } from "./faction-settings.ts";
import { editSan3, findSan3Field } from "./fields.ts";
import { editSan3Governors } from "./governance-draft.ts";
import { editSan3Lifecycle } from "./lifecycle.ts";
import { editSan3PersonalTreasures } from "./personal-treasures.ts";
import { relocateSan3Officers } from "./relocation.ts";
import { san3RelocationPreview } from "./relocation-preview.ts";
import { succeedSan3Ruler } from "./ruler-change.ts";
import { san3RulerPreview } from "./ruler-preview.ts";
import { san3TreasureOwnerLabel } from "./treasure-view.ts";
import { editSan3Treasures, inspectSan3Treasures } from "./treasures.ts";

const invalid = () => new EditorError("invalid_edit", message("editor.invalidEdit"));
const officerName = (document: San3Document, index: number): DisplayText =>
  document.officer(index).name || message("san3.officerRecord", { index: index + 1 });

/** Structural operations remain intents; clients never receive writable list pointers. */
export function editSan3Campaign(document: San3Document, changes: Record<string, number>) {
  const workflow =
    san3FactionSettingsWorkflow(document, changes) ?? san3CampaignWorkflow(document, changes);
  if (workflow) return workflow;
  const moves = new Map<number, number[]>();
  const rulers = new Map<number, number>();
  const touched = new Set<number>();
  const scalar: Record<string, number> = Object.create(null);
  const lifecycle: Record<string, number> = Object.create(null);
  const treasures: Record<string, number> = Object.create(null);
  const personal: Record<string, number> = Object.create(null);
  const appointments: Record<string, number> = Object.create(null);
  const governors: Record<string, number> = Object.create(null);
  const operationChanges: Record<string, number> = {};
  for (const [key, value] of Object.entries(changes)) {
    const move = /^move\.(0|[1-9]\d{0,2})\.city$/.exec(key);
    const ruler = /^ruler\.(0|[1-9]\d?)\.officer$/.exec(key);
    if (key.startsWith("personalTreasure.")) {
      personal[key] = value;
      continue;
    }
    if (key.startsWith("governor.")) {
      governors[key] = value;
      continue;
    }
    if (key.startsWith("lifecycle.")) {
      lifecycle[key] = value;
      continue;
    }
    if (key.startsWith("appointment.")) {
      appointments[key] = value;
      continue;
    }
    if (key.startsWith("treasure.") || key.startsWith("book.")) {
      treasures[key] = value;
      continue;
    }
    if (move) {
      const index = Number(move[1]);
      document.offset("cities", value);
      if (document.officer(index).city === value) continue;
      moves.set(value, [...(moves.get(value) ?? []), index]);
      touched.add(index);
    } else if (ruler) {
      const index = Number(ruler[1]);
      document.offset("officers", value);
      const previous = document.faction(index).ruler;
      if (previous === value) continue;
      rulers.set(index, value);
      touched.add(previous);
      touched.add(value);
    } else {
      scalar[key] = value;
      continue;
    }
    operationChanges[key] = value;
  }
  const transitions = Object.keys(lifecycle).length
    ? editSan3Lifecycle(document, lifecycle)
    : { changes: {} };
  const lifecycleKeys = Object.keys(transitions.changes);
  const treasureEdits = Object.keys(treasures).length
    ? editSan3Treasures(document, treasures).edits
    : [];
  if (treasureEdits.length && (moves.size || rulers.size || lifecycleKeys.length)) throw invalid();
  if (lifecycleKeys.length && (moves.size || rulers.size)) throw invalid();
  for (const key of lifecycleKeys) touched.add(Number(key.split(".")[1]));
  Object.assign(operationChanges, transitions.changes);
  // These operations can change eligibility and roles. Apply each workflow separately.
  if (moves.size && rulers.size) throw invalid();
  for (const key of Object.keys(scalar)) {
    const match = /^officer\.(\d+)\./.exec(key);
    if (!match || !touched.has(Number(match[1]))) continue;
    const field = findSan3Field(document, key, scalar);
    if (scalar[key] !== field.value && field.offset >= san3Layout.officers.offset) throw invalid();
  }
  const result = editSan3(document, scalar);
  let current = new San3Document(result.bytes);
  const operationPreview: EditorView["preview"] = [...result.armyEffects];
  if (Object.keys(governors).length) {
    const appointed = editSan3Governors(current, governors);
    if (
      Object.keys(appointed.changes).length &&
      (moves.size ||
        rulers.size ||
        lifecycleKeys.length ||
        treasureEdits.length ||
        Object.keys(appointments).length)
    )
      throw invalid();
    current = new San3Document(appointed.bytes);
    Object.assign(operationChanges, appointed.changes);
    operationPreview.push(...appointed.preview);
  }
  if (Object.keys(appointments).length) {
    const appointed = editSan3Appointments(current, appointments);
    if (
      Object.keys(appointed.changes).length &&
      (moves.size || rulers.size || lifecycleKeys.length || treasureEdits.length)
    )
      throw invalid();
    current = new San3Document(appointed.bytes);
    Object.assign(operationChanges, appointed.changes);
    operationPreview.push(...appointed.preview);
  }
  if (treasureEdits.length) {
    const inventory = inspectSan3Treasures(current);
    const intents = Object.fromEntries(treasureEdits.map(({ key, after }) => [key, after]));
    const updated = editSan3Treasures(current, intents);
    Object.assign(operationChanges, intents);
    for (const { key, index, kind, before, after } of updated.edits) {
      const ownership = kind === "owner";
      operationPreview.push({
        key,
        label: message("editor.columnLabel", {
          group: ownership
            ? inventory.items[index]?.name || message("san3.treasureRecord", { index: index + 1 })
            : officerName(current, index),
          field: message(ownership ? "san3.treasureOwner" : "san3.bookCopies"),
        }),
        before: ownership ? san3TreasureOwnerLabel(current, before) : before,
        after: ownership ? san3TreasureOwnerLabel(current, after) : after,
      });
    }
    current = new San3Document(updated.bytes);
  }
  if (Object.keys(personal).length) {
    // Explicit personal flags apply after global transfers, so a former owner can
    // deliberately retain a duplicate without changing the requested global owner.
    const updated = editSan3PersonalTreasures(current, personal);
    current = new San3Document(updated.bytes);
    Object.assign(operationChanges, updated.changes);
    operationPreview.push(...updated.preview);
  }
  if (lifecycleKeys.length) {
    const updated = editSan3Lifecycle(current, transitions.changes);
    for (const entry of updated.preview) {
      const index = Number(entry.key.split(".")[1]);
      operationPreview.push({
        ...entry,
        label: message("editor.columnLabel", {
          group: officerName(current, index),
          field: entry.label,
        }),
      });
    }
    current = new San3Document(updated.bytes);
  }
  for (const [destination, indices] of [...moves].sort(([a], [b]) => a - b)) {
    const moved = relocateSan3Officers(
      current,
      indices.sort((a, b) => a - b),
      destination,
    );
    const next = new San3Document(moved.bytes);
    operationPreview.push(...san3RelocationPreview(current, next, moved));
    current = next;
  }
  for (const [faction, successor] of [...rulers].sort(([a], [b]) => a - b)) {
    const replaced = succeedSan3Ruler(current, faction, successor);
    const next = new San3Document(replaced.bytes);
    operationPreview.push(...san3RulerPreview(current, next, faction));
    current = next;
  }
  return { bytes: current.copy(), edits: result.edits, operationChanges, operationPreview };
}
