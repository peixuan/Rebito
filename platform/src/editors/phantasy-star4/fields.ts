import { message } from "../../shared/messages.ts";
import { EditorError, type EditorField } from "../types.ts";
import { type FieldWidth, layout, PhantasyStar4Document } from "./document.ts";

export interface PhantasyStar4Field extends EditorField {
  offset: number;
  width: FieldWidth;
}

const attributes = ["strength", "mental", "agility", "dexterity"] as const;
const fieldModeOnly = [...attributes, "maxHealth", "maxEnergy", "technique", "skill", "maxUses"];
const invalid = () => new EditorError("invalid_edit", message("editor.invalidEdit"));

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

/** Base attributes are editable only when their equipment rules can be recomputed. */
export function characterFields(document: PhantasyStar4Document, index: number) {
  const base = document.personOffset(index);
  const specifications = [
    ["level", 8, 2, 99, "growth", true],
    ["experience", 0x0a, 4, 9_999_999, "growth", false],
    ["health", 0x0e, 2, document.read(base + 0x10, 2), "condition", false],
    ["maxHealth", 0x10, 2, 999, "condition", false],
    ["energy", 0x12, 2, document.read(base + 0x14, 2), "condition", false],
    ["maxEnergy", 0x14, 2, 999, "condition", false],
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
  return specifications.map(([id, relative, width, max, group, readonly]) => {
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
    if (id === "maxHealth") value.min = 1;
    if (id === "maxHealth" || id === "maxEnergy")
      value.help = message("phantasyStar4.maxPointsHelp");
    if (attributes.some((attribute) => attribute === id)) {
      value.readonly = !document.rules;
      if (!document.rules) value.help = message("phantasyStar4.rulesRequiredHelp");
    }
    if (id === "health" || id === "energy")
      value.maximumField = `person.${index}.${id === "health" ? "maxHealth" : "maxEnergy"}`;
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

/** Keep physical slots intact: android hardware unlocks target specific empty slots. */
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
      !document.rules,
    ),
    ...(!document.rules ? { help: message("phantasyStar4.rulesRequiredHelp") } : {}),
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
          !document.rules,
        ),
        ...(!document.rules ? { help: message("phantasyStar4.rulesRequiredHelp") } : {}),
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
          !document.rules && (id === 0 || id >= layout.skillCount),
        ),
        maximumField: `ability.${index}.maxUses.${slot}`,
        enabledByField: `ability.${index}.skill.${slot}`,
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
          99,
          !document.rules && (id === 0 || id >= layout.skillCount),
        ),
        enabledByField: `ability.${index}.skill.${slot}`,
        help: message("phantasyStar4.maxUsesHelp"),
        group,
      },
    );
  }
  return fields;
}

function refreshAttributes(document: PhantasyStar4Document, output: Uint8Array, index: number) {
  const rules = document.rules;
  if (!rules) throw invalid();
  const base = document.personOffset(index);
  const equipment = Array.from(output.slice(base + 0x4c, base + 0x50), (id) => {
    const bonus = rules.equipment[id];
    if (!bonus) throw invalid();
    return bonus;
  });
  const modified = attributes.map((attribute, slot) => {
    const value =
      (output[base + 0x18 + slot * 3] as number) +
      equipment.reduce((sum, item) => sum + item[attribute], 0);
    output[base + 0x19 + slot * 3] = Math.max(0, Math.min(255, value));
    return value;
  });
  const data = new DataView(output.buffer);
  for (const [attribute, relative, source] of [
    ["attack", 0x24, 0],
    ["defence", 0x28, 2],
    ["magicDefence", 0x2c, 1],
  ] as const)
    data.setUint16(
      base + relative,
      (modified[source] as number) + equipment.reduce((sum, item) => sum + item[attribute], 0),
    );
}

function validateLearning(document: PhantasyStar4Document, output: Uint8Array, index: number) {
  if (!document.rules) throw invalid();
  const base = document.personOffset(index);
  const remaining = document.rules.remainingLearning(index, document.read(base + 8, 2));
  for (const [kind, start, count] of [
    ["techniques", 0x52, 16],
    ["skills", 0x62, 8],
  ] as const) {
    const before = Array.from({ length: count }, (_, slot) => document.read(base + start + slot));
    const after = Array.from(output.slice(base + start, base + start + count));
    if (before.every((id, slot) => id === after[slot])) continue;
    // Story/hardware events fill fixed holes, possibly before natural first-free appends.
    const fixed =
      kind === "techniques"
        ? index === 0
          ? [15]
          : []
        : index === 6
          ? [5]
          : index === 7
            ? [4, 5, 6]
            : [];
    const reserved = remaining[kind] + fixed.filter((slot) => after[slot] === 0).length;
    const previousDemand =
      before.filter(Boolean).length +
      remaining[kind] +
      fixed.filter((slot) => before[slot] === 0).length;
    // Preserve unusual existing lists; never add duplicates or consume future learning slots.
    for (const id of new Set(after.filter(Boolean)))
      if (
        after.filter((entry) => entry === id).length >
        Math.max(1, before.filter((entry) => entry === id).length)
      )
        throw invalid();
    if (after.filter(Boolean).length + reserved > Math.max(count, previousDemand))
      throw new EditorError(
        "invalid_edit",
        message("phantasyStar4.learningSpaceRequired", {
          count: reserved,
          ability: message(`phantasyStar4.${kind}`),
        }),
      );
  }
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
  changes = { ...changes };
  // A cleared selector disables its controls; retain the slot's original hidden capacities.
  for (const [key, after] of Object.entries(changes)) {
    const match = /^ability\.(\d+)\.skill\.(\d+)$/.exec(key);
    if (match && after === 0) {
      delete changes[`ability.${match[1]}.uses.${match[2]}`];
      delete changes[`ability.${match[1]}.maxUses.${match[2]}`];
    }
  }
  const edits = Object.entries(changes).map(([key, after]) => {
    const field = findField(document, key);
    const maximum = field.maximumField
      ? (changes[field.maximumField] ?? findField(document, field.maximumField).value)
      : field.max;
    const allowedMaximum =
      field.maximumField && changes[field.maximumField] !== undefined
        ? field.width === 1
          ? 255
          : 0x7fff
        : maximum;
    const enabled = field.enabledByField
      ? (changes[field.enabledByField] ?? findField(document, field.enabledByField).value)
      : undefined;
    if (enabled !== undefined && (enabled <= 0 || enabled >= layout.skillCount)) throw invalid();
    if (
      field.readonly ||
      !Number.isSafeInteger(after) ||
      after < field.min ||
      after > allowedMaximum
    )
      throw invalid();
    after = Math.min(after, maximum);
    if (fieldModeOnly.includes(field.columnId) && document.read(0xef00, 2) !== 12)
      throw new EditorError("invalid_edit", message("phantasyStar4.fieldModeRequired"));
    return { field, before: field.value, after };
  });
  const output = document.copy();
  const data = new DataView(output.buffer);
  for (const { field, after } of edits) {
    if (field.width === 1) data.setUint8(field.offset, after);
    else if (field.width === 2) data.setUint16(field.offset, after);
    else data.setUint32(field.offset, after);
  }
  // Lowering a capacity also lowers its current value; a larger capacity does not heal/refill.
  for (const index of Array.from({ length: layout.persons.count }, (_, index) => index)) {
    if (
      edits.some(
        ({ field, before, after }) =>
          before !== after &&
          field.key.startsWith(`person.${index}.`) &&
          attributes.some((attribute) => attribute === field.columnId),
      )
    )
      refreshAttributes(document, output, index);
    if (
      edits.some(
        ({ field }) =>
          field.key.startsWith(`ability.${index}.`) &&
          ["technique", "skill"].includes(field.columnId),
      )
    )
      validateLearning(document, output, index);
    for (const field of [...characterFields(document, index), ...abilityFields(document, index)]) {
      if (!field.maximumField || changes[field.maximumField] === undefined) continue;
      const after = Math.min(
        changes[field.key] ?? field.value,
        changes[field.maximumField] as number,
      );
      const existing = edits.find((entry) => entry.field.key === field.key);
      if (!existing && after !== field.value) {
        if (field.readonly) throw invalid();
        edits.push({ field, before: field.value, after });
        if (field.width === 1) data.setUint8(field.offset, after);
        else data.setUint16(field.offset, after);
      }
    }
  }
  for (const { field, after } of edits) {
    if (field.columnId !== "skill" || after === 0) continue;
    const [, index, , slot] = field.key.split(".");
    const uses = document.personOffset(Number(index)) + 0x6a + Number(slot) * 2;
    if ((output[uses] as number) > (output[uses + 1] as number)) throw invalid();
  }
  // Inventory has individual item IDs, not stacks. Removal closes gaps in original order.
  if (edits.some(({ field }) => field.key.startsWith("inventory."))) {
    const items = output.subarray(layout.inventory.offset, layout.inventory.offset + 40);
    // Preserve/reorder existing unused records, but do not introduce additional copies.
    for (const unused of document.rules ? [] : [0x1b, 0x76, 0x7b, 0x8c])
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
  new PhantasyStar4Document(output, document.rules);
  return { output, edits: edits.filter(({ before, after }) => before !== after) };
}
