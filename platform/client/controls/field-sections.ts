import type { EditorField, EditorUnavailableField } from "../../src/editors/types.ts";
import { type DisplayText, textIdentity } from "../../src/shared/messages.ts";

interface FieldSection {
  label: DisplayText;
  blocks: Map<string, { label?: DisplayText; fields: EditorField[] }>;
  unavailable: EditorUnavailableField[];
  notes: Map<string, DisplayText>;
}

/** Slot labels and help retain their descriptor identity across language changes. */
export function fieldSections(
  fields: EditorField[],
  unavailable: EditorUnavailableField[],
  order: DisplayText[],
) {
  const sections = new Map<string, FieldSection>();
  function section(label: DisplayText): FieldSection {
    const key = textIdentity(label);
    let result = sections.get(key);
    if (!result) {
      result = { label, blocks: new Map(), unavailable: [], notes: new Map() };
      sections.set(key, result);
    }
    return result;
  }
  for (const label of order) section(label);
  for (const field of fields) {
    const group = section(field.section ?? field.group);
    const key = textIdentity(field.group);
    let block = group.blocks.get(key);
    if (!block) {
      block = { ...(field.section ? { label: field.group } : {}), fields: [] };
      group.blocks.set(key, block);
    }
    block.fields.push(field);
    if (field.help) group.notes.set(textIdentity(field.help), field.help);
  }
  for (const field of unavailable) {
    const group = section(field.group);
    group.unavailable.push(field);
    group.notes.set(textIdentity(field.reason), field.reason);
  }
  return [...sections.values()].filter((group) => group.blocks.size || group.unavailable.length);
}
