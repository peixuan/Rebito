import { message } from "../../shared/messages.ts";
import { EditorError, type EditorField } from "../types.ts";
import { type JinyongDocument, layout } from "./document.ts";

export interface JinyongField extends EditorField {
  offset: number;
  unsigned?: boolean;
}

// Offsets are relative to an original 182-byte character, not a remake record.
const attributes = [
  ["sex", 28, 2, "condition"],
  ["level", 30, 30, "growth"],
  ["experience", 32, 65_535, "growth"],
  ["health", 34, 999, "condition"],
  ["maxHealth", 36, 999, "condition"],
  ["injury", 38, 100, "condition"],
  ["poison", 40, 100, "condition"],
  ["stamina", 42, 100, "condition"],
  ["energyType", 80, 2, "condition"],
  ["energy", 82, 9999, "condition"],
  ["maxEnergy", 84, 9999, "condition"],
  ["attack", 86, 100, "combat"],
  ["speed", 88, 100, "combat"],
  ["defence", 90, 100, "combat"],
  ["medicine", 92, 100, "combat"],
  ["usePoison", 94, 100, "combat"],
  ["detox", 96, 100, "combat"],
  ["poisonResistance", 98, 100, "combat"],
  ["fist", 100, 100, "combat"],
  ["sword", 102, 100, "combat"],
  ["blade", 104, 100, "combat"],
  ["specialWeapon", 106, 100, "combat"],
  ["throwing", 108, 100, "combat"],
  ["knowledge", 110, 100, "growth"],
  ["morality", 112, 100, "growth"],
  ["poisonAttack", 114, 100, "combat"],
  ["dualAttack", 116, 1, "combat"],
  ["reputation", 118, 999, "growth"],
  ["aptitude", 120, 100, "growth"],
] as const;

/** Public field values use stable keys; offsets stay inside the pure adapter. */
export function personFields(document: JinyongDocument, index: number): JinyongField[] {
  document.name("persons", index);
  return attributes.map(([id, relative, max, group]) => {
    const offset = layout.persons.offset + index * layout.persons.stride + relative;
    return {
      key: `person.${index}.${id}`,
      label: message(`jinyong.${id}`),
      group: message(`jinyong.${group}`),
      columnId: id,
      offset,
      unsigned: id === "experience",
      value: document.word(offset, id === "experience"),
      min: id === "level" || id === "maxHealth" ? 1 : 0,
      max,
      ...(id === "sex"
        ? {
            readonly: true,
            help: message("jinyong.sexHelp"),
            choices: ["male", "female", "castrated"].map((id, value) => ({
              value,
              label: message(`jinyong.${id}`),
            })),
          }
        : {}),
      ...(id === "dualAttack" ? { boolean: true } : {}),
      ...(id === "energyType"
        ? {
            choices: ["yin", "yang", "balanced"].map((id, value) => ({
              value,
              label: message(`jinyong.${id}`),
            })),
          }
        : {}),
    };
  });
}

export function skillFields(document: JinyongDocument, index: number): JinyongField[] {
  document.name("persons", index);
  const choices = Array.from({ length: layout.skills.count }, (_, value) => ({
    value,
    label: value === 0 ? message("jinyong.noSkill") : document.name("skills", value),
  }));
  return Array.from({ length: 10 }, (_, slot) =>
    (["id", "proficiency"] as const).map((part) => {
      const offset =
        layout.persons.offset +
        index * layout.persons.stride +
        (part === "id" ? 126 : 146) +
        slot * 2;
      return {
        key: `skill.${index}.${slot}.${part}`,
        label: message(`jinyong.${part === "id" ? "skill" : part}`),
        group: message("jinyong.skillSlot", { index: slot + 1 }),
        columnId: `${slot}.${part}`,
        offset,
        value: document.word(offset),
        min: 0,
        max: part === "id" ? 92 : 999,
        ...(part === "id" ? { choices } : { help: message("jinyong.proficiencyHelp") }),
      };
    }),
  ).flat();
}

export function findCharacterField(document: JinyongDocument, key: string): JinyongField {
  const match = /^(person|skill)\.(0|[1-9]\d{0,2})\./.exec(key);
  if (match) {
    const index = Number(match[2]);
    const fields =
      match[1] === "person" ? personFields(document, index) : skillFields(document, index);
    const field = fields.find((field) => field.key === key);
    if (field) return field;
  }
  throw new EditorError("invalid_edit", message("editor.invalidEdit"));
}

/** Validate first, then copy/write: a failed batch never partially changes its input. */
export function editCharacters(document: JinyongDocument, changes: Record<string, number>) {
  const edits = Object.entries(changes).map(([key, value]) => {
    const field = findCharacterField(document, key);
    if (field.readonly || !Number.isSafeInteger(value) || value < field.min || value > field.max)
      throw new EditorError("invalid_edit", message("editor.invalidEdit"));
    return { field, before: field.value, after: value };
  });
  const output = document.copy();
  const data = new DataView(output.buffer);
  for (const { field, after } of edits) {
    if (field.unsigned) data.setUint16(field.offset, after, true);
    else data.setInt16(field.offset, after, true);
  }
  return { output, edits: edits.filter(({ before, after }) => before !== after) };
}
