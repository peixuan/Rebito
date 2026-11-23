import { message } from "../../shared/messages.ts";
import { EditorError, type EditorField } from "../types.ts";
import { type San3Document, san3Attributes, san3Layout } from "./document.ts";

/** Definitions are separate from current campaign traits; this view cannot edit either. */
export function historicalContextFields(document: San3Document, index: number): EditorField[] {
  if (!Number.isInteger(index) || index < 0 || index >= san3Layout.historical.count)
    throw new EditorError("invalid_edit", message("editor.selectRecord"));
  const offset = san3Layout.historical.offset + index * san3Layout.historical.stride;
  const definitions = [
    ["portrait", document.read(offset, 2), 65535],
    ["birthYear", document.read(offset + 14, 1), 255],
    ["lineage", document.read(offset + 13, 1), 255],
    ["lifespan", (document.read(offset + 4, 1) >> 4) & 7, 7],
    ["compatibility", document.read(offset + 11, 1), 255],
    ["morality", document.read(offset + 12, 1), 255],
    ["ambition", document.read(offset + 2, 1) >> 4, 15],
    ["luck", document.read(offset + 2, 1) & 15, 15],
    ["composure", document.read(offset + 3, 1) >> 4, 15],
    ["bravery", document.read(offset + 3, 1) & 15, 15],
    ...san3Attributes.map(
      (id, relative) => [id, document.read(offset + 5 + relative, 1), 255] as const,
    ),
  ] as const;
  return definitions.map(([id, value, max]) => ({
    key: `historical.${index}.${id}`,
    label: message(`san3.${id}`),
    group: message("san3.historicalContext"),
    columnId: id,
    value,
    min: 0,
    max,
    readonly: true,
  }));
}

/** Diplomacy is observable context, not a byte-level shortcut around game transitions. */
export function factionContextFields(document: San3Document, index: number): EditorField[] {
  const offset = document.offset("factions", index);
  const fields: EditorField[] = (
    [
      ["jointFaction", 0x24, 1],
      ["jointTarget", 0x25, 1],
      ["jointRewardType", 0x27, 1],
      ["jointRewardAmount", 0x28, 2],
      ["nomadicCity", 0x2a, 1],
      ["nomadicGold", 0x2c, 2],
      ["nomadicFood", 0x2e, 4],
    ] as const
  ).map(([id, relative, width]) => ({
    key: `faction.${index}.${id}`,
    label: message(`san3.${id}`),
    group: message("san3.factionContext"),
    columnId: id,
    value: document.read(offset + relative, width),
    min: 0,
    max: 2 ** (8 * width) - 1,
    readonly: true,
  }));
  // Native alliance checks read the BE word at+6; faction0 is the low bit of+9.
  const alliances = document.read(offset + 6, 4);
  for (let target = 0; target < san3Layout.factions.count; target++) {
    for (const kind of ["alliance", "hostility"] as const) {
      fields.push({
        key: `faction.${index}.${kind}.${target}`,
        label: message("san3.factionNumber", { number: target + 1 }),
        group: message(kind === "alliance" ? "san3.alliances" : "san3.hostilities"),
        columnId: `${kind}.${target}`,
        value:
          kind === "alliance" ? (alliances >>> target) & 1 : document.read(offset + 15 + target, 1),
        min: 0,
        max: kind === "alliance" ? 1 : 255,
        readonly: true,
        ...(kind === "alliance" ? { boolean: true } : {}),
      });
    }
  }
  return fields;
}
