import { type DisplayText, message } from "../../shared/messages.ts";
import { EditorError, type EditorField } from "../types.ts";
import { type EiketsudenDocument, layout } from "./document.ts";
import type { EiketsudenRules } from "./rules.ts";

export interface EiketsudenField extends EditorField {
  offset?: number;
  width?: 1 | 2;
}

export function campaignFields(document: EiketsudenDocument): EiketsudenField[] {
  return [
    {
      key: "campaign.0.money",
      label: message("eiketsuden.money"),
      group: message("eiketsuden.campaign"),
      columnId: "money",
      value: document.money(),
      min: 0,
      max: 10_000,
      offset: layout.money,
      width: 2,
      help: message("eiketsuden.moneyHelp"),
    },
  ];
}

/** Only reviewed persisted fields get write offsets; fixed abilities remain read-only. */
export function characterFields(
  document: EiketsudenDocument,
  index: number,
  rules: EiketsudenRules,
): EiketsudenField[] {
  const row = document.character(index);
  const offset = document.characterOffset(index);
  const reference = rules.characters[index];
  if (!reference) throw new EditorError("invalid_save", message("editor.invalidSave"));
  const fields: EiketsudenField[] = (
    [
      ["level", 8, 1, 99],
      ["experience", 9, 0, 99],
      ["troopClass", 7, 0, 18],
    ] as const
  ).map(([id, relative, min, max]) => ({
    key: `characters.${index}.${id}`,
    label: message(`eiketsuden.${id}`),
    group: message("eiketsuden.progress"),
    columnId: id,
    value: row[id],
    min,
    max,
    offset: offset + relative,
    ...(id === "troopClass"
      ? {
          choices: Array.from({ length: layout.classCount }, (_, value) => ({
            value,
            label: message(`eiketsuden.class.${value}`),
          })),
          help: message("eiketsuden.classHelp"),
        }
      : {}),
  }));
  const choices = [
    { value: 255, label: message("eiketsuden.empty") as DisplayText },
    ...rules.items.map((label, value) => ({ value, label })),
  ];
  for (let slot = 0; slot < layout.itemSlots; slot++)
    fields.push({
      key: `characters.${index}.item${slot}`,
      label: message("eiketsuden.itemSlot", { index: slot + 1 }),
      group: message("eiketsuden.items"),
      columnId: `item${slot}`,
      value: row.items[slot] ?? 255,
      min: 0,
      max: 255,
      choices,
      offset: offset + 10 + slot,
      help: message("eiketsuden.itemsHelp"),
    });
  fields.push({
    key: `characters.${index}.troops`,
    label: message("eiketsuden.troops"),
    group: message("eiketsuden.reference"),
    columnId: "troops",
    value: row.troops,
    min: 0,
    max: 65_535,
    readonly: true,
    help: message("eiketsuden.troopsHelp"),
  });
  for (const id of ["leadership", "strength", "intelligence"] as const)
    fields.push({
      key: `characters.${index}.${id}`,
      label: message(`eiketsuden.${id}`),
      group: message("eiketsuden.reference"),
      columnId: id,
      value: reference[id],
      min: 0,
      max: 100,
      readonly: true,
      help: message("eiketsuden.baseHelp"),
    });
  return fields;
}

export function findField(document: EiketsudenDocument, rules: EiketsudenRules, key: string) {
  const match = /^characters\.(0|[1-9]\d{0,2})\./.exec(key);
  const field = (
    match ? characterFields(document, Number(match[1]), rules) : campaignFields(document)
  ).find((candidate) => candidate.key === key);
  if (!field) throw new EditorError("invalid_edit", message("editor.invalidEdit"));
  return field;
}

/** Validate the entire draft before writing a private copy, including all choice IDs. */
export function editFields(
  document: EiketsudenDocument,
  rules: EiketsudenRules,
  changes: Record<string, number>,
) {
  const edits = Object.entries(changes)
    .map(([key, value]) => {
      const field = findField(document, rules, key);
      const offset = field.offset;
      if (
        field.readonly ||
        offset === undefined ||
        !Number.isSafeInteger(value) ||
        value < field.min ||
        value > field.max ||
        (field.choices && !field.choices.some((choice) => choice.value === value))
      )
        throw new EditorError("invalid_edit", message("editor.invalidEdit"));
      return { field, offset, before: field.value, after: value };
    })
    .filter(({ before, after }) => before !== after);
  const output = document.copy();
  const data = new DataView(output.buffer);
  for (const { field, offset, after } of edits) {
    if (field.width === 2) data.setUint16(offset, after, true);
    else data.setUint8(offset, after);
  }
  return { output, edits };
}
