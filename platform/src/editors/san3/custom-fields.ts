import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import { type San3Document, san3Layout } from "./document.ts";
import type { San3Field } from "./fields.ts";

const invalid = () => new EditorError("invalid_edit", message("editor.invalidEdit"));
const monthDays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function customOffset(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= san3Layout.custom.count) throw invalid();
  return san3Layout.custom.offset + index * san3Layout.custom.stride;
}

/** SETTEI uses a fixed birthday calendar, including February 29 regardless of age. */
function days(month: number): number {
  return Number.isInteger(month) ? (monthDays[month - 1] ?? 0) : 0;
}

function portraitChoices(document: San3Document) {
  // High-bit portrait IDs are searched at 0x223da, not used as image array indexes.
  const lookup = new Set<number>();
  let previous = 0x7fff;
  for (let index = 0; index < 311; index++) {
    const value = document.read(0x478f0 + index * 2, 2);
    if (value <= previous || value >= 0xffff) throw invalid();
    lookup.add(value);
    previous = value;
  }
  // Creation's male/female ruler and officer selectors cover exactly 231..306.
  const values = new Set(Array.from({ length: 76 }, (_, index) => index + 231));
  for (let index = 0; index < san3Layout.historical.count; index++) {
    const value = document.read(san3Layout.historical.offset + index * 30, 2);
    if ((value >= 1 && value <= 307) || lookup.has(value)) values.add(value);
  }
  return [...values]
    .sort((left, right) => left - right)
    .map((value) => ({
      value,
      label: message("san3.portraitNumber", { number: value }),
    }));
}

/** Custom defaults stay editable without registering an unused slot or changing links. */
export function customMetadataFields(
  document: San3Document,
  index: number,
  changes: Record<string, number> = {},
): San3Field[] {
  const offset = customOffset(index);
  const month = changes[`custom.${index}.birthMonth`] ?? document.read(offset + 10, 1);
  const portrait = document.read(offset, 2);
  const portraits =
    portrait === 0xffff
      ? [{ value: 0xffff, label: message("san3.unregistered") }]
      : portraitChoices(document);
  return (
    [
      ["gender", 3, 1, 0, 1],
      ["birthMonth", 10, 1, 1, 12],
      ["birthDay", 11, 1, 1, days(month)],
      ["age", 12, 1, 1, 99],
      ["portrait", 0, 2, 1, 0xffff],
    ] as const
  ).map(([id, relative, width, min, max]) => ({
    key: `custom.${index}.${id}`,
    label: message(`san3.${id}`),
    group: message("san3.customProfile"),
    columnId: id,
    offset: offset + relative,
    width,
    value: document.read(offset + relative, width),
    min,
    max,
    ...(id === "gender"
      ? {
          choices: [
            { value: 0, label: message("san3.male") },
            { value: 1, label: message("san3.female") },
          ],
        }
      : {}),
    ...(id === "birthDay" ? { help: message("san3.birthdayHelp") } : {}),
    ...(id === "portrait"
      ? {
          choices: portraits,
          readonly: portrait === 0xffff || !portraits.some((choice) => choice.value === portrait),
          help: message("san3.portraitHelp"),
        }
      : {}),
  }));
}

/** Check the final date after all draft changes, independently of property order. */
export function validateCustomFields(
  document: San3Document,
  changes: Record<string, number>,
): void {
  const affected = new Set<number>();
  for (const [key, value] of Object.entries(changes)) {
    if (!key.startsWith("custom.")) continue;
    const match = /^custom\.(0|[1-9]\d?)\./.exec(key);
    if (!match) throw invalid();
    const index = Number(match[1]);
    const field = customMetadataFields(document, index, changes).find((entry) => entry.key === key);
    if (
      !field ||
      field.readonly ||
      !Number.isSafeInteger(value) ||
      value < field.min ||
      value > field.max ||
      (field.choices && !field.choices.some((choice) => choice.value === value))
    )
      throw invalid();
    affected.add(index);
  }
  for (const index of affected) {
    const offset = customOffset(index);
    const month = changes[`custom.${index}.birthMonth`] ?? document.read(offset + 10, 1);
    const day = changes[`custom.${index}.birthDay`] ?? document.read(offset + 11, 1);
    if (!Number.isSafeInteger(day) || day < 1 || day > days(month)) throw invalid();
  }
}
