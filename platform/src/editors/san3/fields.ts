import { message } from "../../shared/messages.ts";
import { EditorError, type EditorField } from "../types.ts";
import { canSwitchSan3Army, editSan3Army } from "./army.ts";
import { cityDetailFields } from "./city-fields.ts";
import { customMetadataFields, validateCustomFields } from "./custom-fields.ts";
import { San3Document, san3Attributes, san3Layout } from "./document.ts";
import { officerTraitFields } from "./officer-traits.ts";

export interface San3Field extends EditorField {
  offset: number;
  width: 1 | 2 | 4;
  mask?: number;
  shift?: number;
}

/** Only custom abilities belong to native saves; historical definitions are disc data. */
export function attributeFields(document: San3Document, index: number): San3Field[] {
  const offset = document.attributeOffset(index);
  const values = document.attributes(index);
  const valid = Object.values(values).every((value) => value >= 1 && value <= 100);
  return san3Attributes.map((id, relative) => ({
    key: `officer.${index}.${id}`,
    label: message(`san3.${id}`),
    group: message("san3.baseAttributes"),
    columnId: id,
    offset: offset + relative,
    width: 1,
    value: values[id],
    min: 1,
    max: 100,
    readonly: index < san3Layout.historical.count || !valid,
    ...(relative === 0
      ? {
          help: message(
            index < san3Layout.historical.count
              ? "san3.historicalAttributesHelp"
              : "san3.customAttributesHelp",
          ),
        }
      : {}),
  }));
}

/** Population is stored in hundreds; the shared multiplier presents people. */
export function cityFields(document: San3Document, index: number): San3Field[] {
  const offset = document.offset("cities", index);
  const resources = (
    [
      ["population", 0x0c, 2, 30_000],
      ["gold", 0x0e, 2, 50_000],
      ["food", 0x10, 4, 3_000_000],
    ] as const
  ).map(([id, relative, width, max]) => ({
    key: `city.${index}.${id}`,
    label: message(`san3.${id}`),
    group: message("san3.resources"),
    columnId: id,
    offset: offset + relative,
    width,
    value: document.read(offset + relative, width),
    min: 0,
    max,
    ...(id === "population" ? { multiplier: 100 } : {}),
  }));
  return [...resources, ...cityDetailFields(document, index)];
}

export function officerFields(
  document: San3Document,
  index: number,
  changes: Record<string, number> = {},
): San3Field[] {
  const officer = document.officer(index);
  const offset = document.offset("officers", index);
  const equipped = (document.read(offset + 10, 1) & 15) !== 0;
  const canSwitch = canSwitchSan3Army(document, index);
  const soldiers = changes[`officer.${index}.soldiers`] ?? officer.soldiers;
  const military = (
    [
      ["soldiers", 2, 2, officer.soldierLimit],
      ["loyalty", 0x0f, 1, 100],
      ["training", 0x15, 1, 100],
      ["morale", 0x16, 1, 120],
    ] as const
  ).map(([id, relative, width, max]) => ({
    key: `officer.${index}.${id}`,
    label: message(`san3.${id}`),
    group: message("san3.officer"),
    columnId: id,
    offset: offset + relative,
    width,
    value: document.read(offset + relative, width),
    min: id === "soldiers" && !canSwitch && officer.soldiers > 0 ? 1 : 0,
    max,
    readonly:
      !officer.available ||
      (id === "loyalty" ? officer.role === 0 : officer.soldiers === 0 && !canSwitch) ||
      (id === "soldiers" && equipped),
    ...((id === "training" || id === "morale") && soldiers === 0
      ? { enabledByField: `officer.${index}.soldiers` }
      : {}),
    ...(id === "soldiers"
      ? { help: message(equipped ? "san3.equippedTroopsHelp" : "san3.armyEditHelp") }
      : {}),
  }));
  return [...military, ...attributeFields(document, index), ...officerTraitFields(document, index)];
}

export function findSan3Field(
  document: San3Document,
  key: string,
  changes: Record<string, number> = {},
): San3Field {
  const match = /^(city|officer|custom)\.(0|[1-9]\d{0,2})\./.exec(key);
  if (match) {
    const index = Number(match[2]);
    const fields =
      match[1] === "city"
        ? cityFields(document, index)
        : match[1] === "custom"
          ? customMetadataFields(document, index, changes)
          : officerFields(document, index, changes);
    const field = fields.find((candidate) => candidate.key === key);
    if (field) return field;
  }
  throw new EditorError("invalid_edit", message("editor.invalidEdit"));
}

/** Validate atomically, including troop edits against the final leadership values. */
export function editSan3(document: San3Document, changes: Record<string, number>) {
  validateCustomFields(document, changes);
  const edits = Object.entries(changes).map(([key, value]) => {
    const field = findSan3Field(document, key, changes);
    if (field.columnId === "training" || field.columnId === "morale") {
      const index = Number(key.split(".")[1]);
      const soldiers = changes[`officer.${index}.soldiers`] ?? document.officer(index).soldiers;
      if (soldiers === 0 && (changes[`officer.${index}.soldiers`] !== 0 || value !== 0))
        throw new EditorError("invalid_edit", message("editor.invalidEdit"));
    }
    let maximum = field.max;
    if (field.columnId === "soldiers") {
      const index = Number(key.split(".")[1]);
      const attributes = document.attributes(index);
      const land = changes[`officer.${index}.land`] ?? attributes.land;
      const naval = changes[`officer.${index}.naval`] ?? attributes.naval;
      maximum = 10_000 + Math.max(land, naval) * 100;
    }
    if (field.readonly || !Number.isSafeInteger(value) || value < field.min || value > maximum)
      throw new EditorError("invalid_edit", message("editor.invalidEdit"));
    return { field, before: field.value, after: value };
  });
  let bytes = document.copy();
  const data = new DataView(bytes.buffer);
  const transitions = new Set(
    edits
      .filter(({ field, before, after }) => field.columnId === "soldiers" && (!before || !after))
      .map(({ field }) => Number(field.key.split(".")[1])),
  );
  const armyFields = new Set(["soldiers", "training", "morale"]);
  for (const { field, after } of edits) {
    if (transitions.has(Number(field.key.split(".")[1])) && armyFields.has(field.columnId))
      continue;
    if (field.width === 1) {
      const shift = field.shift ?? 0;
      const value =
        field.mask === undefined
          ? after
          : (data.getUint8(field.offset) & ~(field.mask << shift)) |
            ((after & field.mask) << shift);
      data.setUint8(field.offset, value);
    } else if (field.width === 2) data.setUint16(field.offset, after);
    else data.setUint32(field.offset, after);
  }
  const armyEffects: { key: string; label: EditorField["label"]; before: number; after: number }[] =
    [];
  for (const index of transitions) {
    const before = new San3Document(bytes);
    const training = changes[`officer.${index}.training`];
    const morale = changes[`officer.${index}.morale`];
    const result = editSan3Army(before, index, {
      soldiers: changes[`officer.${index}.soldiers`] as number,
      ...(training === undefined ? {} : { training }),
      ...(morale === undefined ? {} : { morale }),
    });
    const after = new San3Document(result.bytes);
    for (const id of ["training", "morale"] as const)
      if (
        changes[`officer.${index}.${id}`] === undefined &&
        before.officer(index)[id] !== after.officer(index)[id]
      )
        armyEffects.push({
          key: `armyEffect.${index}.${id}`,
          label: message("editor.columnLabel", {
            group:
              before.officer(index).name || message("san3.officerRecord", { index: index + 1 }),
            field: message(`san3.${id}`),
          }),
          before: before.officer(index)[id],
          after: after.officer(index)[id],
        });
    bytes = result.bytes;
  }
  return { bytes, edits, armyEffects };
}
