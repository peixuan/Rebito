import { type DisplayText, message } from "../../shared/messages.ts";
import { EditorError, type EditorView } from "../types.ts";
import { San3Document, san3Layout } from "./document.ts";
import { editSan3, findSan3Field } from "./fields.ts";
import { relocateSan3Officers } from "./relocation.ts";
import { replaceSan3Ruler } from "./ruler-change.ts";

const invalid = () => new EditorError("invalid_edit", message("editor.invalidEdit"));
const officerName = (document: San3Document, index: number): DisplayText =>
  document.officer(index).name || message("san3.officerRecord", { index: index + 1 });
const cityName = (document: San3Document, index: number): DisplayText =>
  document.city(index).name || message("san3.cityRecord", { index: index + 1 });

/** Structural operations remain intents; clients never receive writable list pointers. */
export function editSan3Campaign(document: San3Document, changes: Record<string, number>) {
  const moves = new Map<number, number[]>();
  const rulers = new Map<number, number>();
  const touched = new Set<number>();
  const scalar: Record<string, number> = {};
  const operationChanges: Record<string, number> = {};
  for (const [key, value] of Object.entries(changes)) {
    const move = /^move\.(0|[1-9]\d{0,2})\.city$/.exec(key);
    const ruler = /^ruler\.(0|[1-9]\d?)\.officer$/.exec(key);
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
  // These operations can change eligibility and roles. Apply each workflow separately.
  if (moves.size && rulers.size) throw invalid();
  for (const key of Object.keys(scalar)) {
    const match = /^officer\.(\d+)\./.exec(key);
    if (
      match &&
      touched.has(Number(match[1])) &&
      findSan3Field(document, key).offset >= san3Layout.officers.offset
    )
      throw invalid();
  }
  const result = editSan3(document, scalar);
  let current = new San3Document(result.bytes);
  const operationPreview: EditorView["preview"] = [];
  for (const [destination, indices] of [...moves].sort(([a], [b]) => a - b)) {
    const moved = relocateSan3Officers(
      current,
      indices.sort((a, b) => a - b),
      destination,
    );
    for (const move of moved.moves) {
      const group = officerName(current, move.index);
      const prefix = `move.${move.index}`;
      const base = current.offset("officers", move.index);
      operationPreview.push({
        key: `${prefix}.city`,
        label: message("editor.columnLabel", { group, field: message("san3.moveTo") }),
        before: cityName(current, move.fromCity),
        after: cityName(current, move.toCity),
      });
      for (const [id, before, after] of [
        ["soldiers", move.soldiersRemoved, 0],
        ["training", current.read(base + 21, 1), 0],
        ["morale", current.read(base + 22, 1), 0],
        ["actionComplete", current.read(base + 8, 1) & 1, 0],
        [
          "loyalty",
          current.read(base + 15, 1),
          move.toFaction === 0xff ? current.read(base + 15, 1) : 100,
        ],
        ["role", move.fromRole, move.toRole],
        ["faction", move.fromFaction, move.toFaction],
      ] as const)
        if (before !== after)
          operationPreview.push({
            key: `${prefix}.${id}`,
            label: message("editor.columnLabel", { group, field: message(`san3.${id}`) }),
            before,
            after,
          });
    }
    current = new San3Document(moved.bytes);
  }
  for (const [faction, successor] of [...rulers].sort(([a], [b]) => a - b)) {
    const replaced = replaceSan3Ruler(current, faction, successor);
    const change = replaced.change;
    operationPreview.push({
      key: `ruler.${faction}.officer`,
      label: message("san3.replaceRuler"),
      before: officerName(current, change.previousRuler),
      after: officerName(current, successor),
    });
    for (const index of [change.previousRuler, successor]) {
      for (const [id, relative] of [
        ["role", 12],
        ["loyalty", 15],
      ] as const) {
        const base = current.offset("officers", index);
        operationPreview.push({
          key: `ruler.${faction}.${index}.${id}`,
          label: message("editor.columnLabel", {
            group: officerName(current, index),
            field: message(`san3.${id}`),
          }),
          before: current.read(base + relative, 1),
          after: replaced.bytes[base + relative] ?? 0,
        });
      }
    }
    current = new San3Document(replaced.bytes);
  }
  return { bytes: current.copy(), edits: result.edits, operationChanges, operationPreview };
}
