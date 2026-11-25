import { type DisplayText, message } from "../../shared/messages.ts";
import { EditorError, type EditorField, type EditorView } from "../types.ts";
import { type EiketsudenDocument, layout } from "./document.ts";
import { campaignFields, characterFields } from "./fields.ts";
import type { EiketsudenRules } from "./rules.ts";

export const modules = ["characters", "campaign"] as const;
export type EiketsudenModule = (typeof modules)[number];

export function displayValue(field: EditorField, value: number): number | DisplayText {
  return field.choices
    ? (field.choices.find((entry) => entry.value === value)?.label ??
        message("editor.unknownValue", { value }))
    : value;
}

export function fieldsFor(
  document: EiketsudenDocument,
  rules: EiketsudenRules,
  module: EiketsudenModule,
  index: number,
): EditorField[] {
  const fields =
    module === "campaign" ? campaignFields(document) : characterFields(document, index, rules);
  return fields.map(({ offset: _offset, width: _width, ...field }) => field);
}

/** Build sortable cells without repeating the full item catalog for every row. */
export function rowsFor(
  document: EiketsudenDocument,
  rules: EiketsudenRules,
  module: EiketsudenModule,
): EditorView["records"] {
  if (module === "campaign")
    return [
      {
        id: "0",
        label: message("eiketsuden.campaign"),
        summary: "",
        tags: [],
        available: true,
        cells: { money: document.money() },
      },
    ];
  return Array.from({ length: layout.characters.count }, (_, index) => {
    const row = document.character(index);
    const party = document.inParty(index);
    const reference = rules.characters[index];
    if (!reference) throw new EditorError("invalid_save", message("editor.invalidSave"));
    const cells: Record<string, number | DisplayText> = {
      level: row.level,
      experience: row.experience,
      troops: row.troops,
      troopClass: message(`eiketsuden.class.${row.troopClass}`),
      leadership: reference.leadership,
      strength: reference.strength,
      intelligence: reference.intelligence,
    };
    for (const [slot, id] of row.items.entries())
      cells[`item${slot}`] =
        id === 255
          ? message("eiketsuden.empty")
          : (rules.items[id] ?? message("editor.unknownValue", { value: id }));
    return {
      id: String(index),
      label: reference.name,
      summary: message(party ? "eiketsuden.partyMember" : "eiketsuden.otherCharacter"),
      tags: party ? ["party"] : [],
      available: true,
      cells,
    };
  });
}
