import { message } from "../../shared/messages.ts";
import { EditorError, type EditorField } from "../types.ts";
import { type FieldWidth, layout, PhantasyStar4Document } from "./document.ts";

export interface PhantasyStar4Field extends EditorField {
  offset: number;
  width: FieldWidth;
}

function field(
  document: PhantasyStar4Document,
  key: string,
  id: string,
  group: string,
  offset: number,
  width: FieldWidth,
  max: number,
  readonly = false,
): PhantasyStar4Field {
  return {
    key,
    label: message(`phantasyStar4.${id}`),
    group: message(`phantasyStar4.${group}`),
    columnId: id,
    offset,
    width,
    value: document.read(offset, width),
    min: 0,
    max,
    readonly,
  };
}

export function partyFields(document: PhantasyStar4Document): PhantasyStar4Field[] {
  return [field(document, "party.money", "money", "party", layout.money, 4, 9_999_999)];
}

/** Game-owned level/equipment caches remain visible but cannot be silently invalidated. */
export function characterFields(document: PhantasyStar4Document, index: number) {
  const base = document.personOffset(index);
  const attributes = [
    ["level", 8, 2, 99, "growth", true],
    ["experience", 0x0a, 4, 9_999_999, "growth", false],
    ["health", 0x0e, 2, document.read(base + 0x10, 2), "condition", false],
    ["maxHealth", 0x10, 2, 0x7fff, "condition", true],
    ["energy", 0x12, 2, document.read(base + 0x14, 2), "condition", false],
    ["maxEnergy", 0x14, 2, 0x7fff, "condition", true],
    ["status", 0x16, 1, 255, "condition", true],
    ["strength", 0x18, 1, 255, "combat", true],
    ["mental", 0x1b, 1, 255, "combat", true],
    ["agility", 0x1e, 1, 255, "combat", true],
    ["dexterity", 0x21, 1, 255, "combat", true],
    ["attack", 0x24, 2, 65_535, "combat", true],
    ["defence", 0x28, 2, 65_535, "combat", true],
    ["magicDefence", 0x2c, 2, 65_535, "combat", true],
    ["rightHand", 0x4c, 1, 160, "equipment", true],
    ["leftHand", 0x4d, 1, 160, "equipment", true],
    ["head", 0x4e, 1, 160, "equipment", true],
    ["body", 0x4f, 1, 160, "equipment", true],
  ] as const;
  return attributes.map(([id, relative, width, max, group, readonly]) => {
    const value = field(
      document,
      `person.${index}.${id}`,
      id,
      group,
      base + relative,
      width,
      max,
      readonly,
    );
    if (id === "health") {
      // Death is a separate game state; a scalar HP edit must not impersonate revival or death.
      value.readonly = (document.read(base + 0x16) & 0x44) !== 0;
      value.min = value.readonly ? 0 : 1;
    }
    return value;
  });
}

export function inventoryFields(document: PhantasyStar4Document, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= layout.inventory.count)
    throw new EditorError("invalid_edit", message("editor.selectRecord"));
  return [
    field(
      document,
      `inventory.${index}.item`,
      "item",
      "inventory",
      layout.inventory.offset + index,
      1,
      layout.itemCount - 1,
    ),
  ];
}

/** Learned lists are bounded; refilling uses never adds skills or exceeds learned capacity. */
export function abilityFields(document: PhantasyStar4Document, index: number) {
  const base = document.personOffset(index);
  const fields = Array.from({ length: 16 }, (_, slot) => ({
    ...field(
      document,
      `ability.${index}.technique.${slot}`,
      "technique",
      "techniques",
      base + 0x52 + slot,
      1,
      layout.techniqueCount - 1,
      true,
    ),
    group: message("phantasyStar4.techniqueSlot", { index: slot + 1 }),
  }));
  for (let slot = 0; slot < 8; slot++) {
    const maximum = document.read(base + 0x6b + slot * 2);
    const id = document.read(base + 0x62 + slot);
    const group = message("phantasyStar4.skillSlot", { index: slot + 1 });
    fields.push(
      {
        ...field(
          document,
          `ability.${index}.skill.${slot}`,
          "skill",
          "skills",
          base + 0x62 + slot,
          1,
          layout.skillCount - 1,
          true,
        ),
        group,
      },
      {
        ...field(
          document,
          `ability.${index}.uses.${slot}`,
          "uses",
          "skills",
          base + 0x6a + slot * 2,
          1,
          maximum,
          id === 0 || id >= layout.skillCount,
        ),
        group,
      },
      {
        ...field(
          document,
          `ability.${index}.maxUses.${slot}`,
          "maxUses",
          "skills",
          base + 0x6b + slot * 2,
          1,
          255,
          true,
        ),
        group,
      },
    );
  }
  return fields;
}

function findField(document: PhantasyStar4Document, key: string): PhantasyStar4Field {
  if (key === "party.money") return partyFields(document)[0] as PhantasyStar4Field;
  const match = /^(person|inventory|ability)\.(0|[1-9]\d?)\./.exec(key);
  if (match) {
    const index = Number(match[2]);
    const fields =
      match[1] === "inventory"
        ? inventoryFields(document, index)
        : match[1] === "ability"
          ? abilityFields(document, index)
          : characterFields(document, index);
    const found = fields.find((candidate) => candidate.key === key);
    if (found) return found;
  }
  throw new EditorError("invalid_edit", message("editor.invalidEdit"));
}

/** Validate the complete draft before writing, then report all actual byte-field changes. */
export function editFields(document: PhantasyStar4Document, changes: Record<string, number>) {
  const edits = Object.entries(changes).map(([key, after]) => {
    const field = findField(document, key);
    if (field.readonly || !Number.isSafeInteger(after) || after < field.min || after > field.max)
      throw new EditorError("invalid_edit", message("editor.invalidEdit"));
    return { field, before: field.value, after };
  });
  const output = document.copy();
  const data = new DataView(output.buffer);
  for (const { field, after } of edits) {
    if (field.width === 1) data.setUint8(field.offset, after);
    else if (field.width === 2) data.setUint16(field.offset, after);
    else data.setUint32(field.offset, after);
  }
  // Inventory has individual item IDs, not stacks. Removal closes gaps in original order.
  if (edits.some(({ field }) => field.key.startsWith("inventory."))) {
    const items = output.subarray(layout.inventory.offset, layout.inventory.offset + 40);
    // Preserve/reorder existing unused records, but do not introduce additional copies.
    for (const unused of [0x1b, 0x76, 0x7b, 0x8c])
      if (
        items.filter((id) => id === unused).length >
        document.inventory().filter((id) => id === unused).length
      )
        throw new EditorError("invalid_edit", message("editor.invalidEdit"));
    const held = items.filter((id) => id !== 0);
    items.fill(0);
    items.set(held);
    for (let index = 0; index < 40; index++) {
      const field = inventoryFields(document, index)[0] as PhantasyStar4Field;
      const prior = edits.find((entry) => entry.field.key === field.key);
      if (prior) prior.after = items[index] as number;
      else if (field.value !== items[index])
        edits.push({ field, before: field.value, after: items[index] as number });
    }
  }
  new PhantasyStar4Document(output);
  return { output, edits: edits.filter(({ before, after }) => before !== after) };
}
