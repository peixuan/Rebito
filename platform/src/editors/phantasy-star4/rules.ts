import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import { layout } from "./document.ts";

export interface EquipmentBonuses {
  readonly strength: number;
  readonly mental: number;
  readonly agility: number;
  readonly dexterity: number;
  readonly attack: number;
  readonly defence: number;
  readonly magicDefence: number;
}

/** Rules extracted from the immutable user ROM, never from bundled game tables. */
export interface PhantasyStar4Rules {
  readonly equipment: readonly EquipmentBonuses[];
  /** The game appends every future learned entry, even when its ID is already present. */
  remainingLearning(character: number, level: number): { techniques: number; skills: number };
}

const itemTable = 0x2aa288;
const growthPointers = 0x3f8e;
const rowSize = 22;
const minimumSize = itemTable + (layout.itemCount - 1) * rowSize;
export const phantasyStar4RomLimit = 4 * 1024 * 1024;

function matches(bytes: Uint8Array, offset: number, text: string) {
  return [...text].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

/** Unsupported headers or malformed tables disable advanced rules, not the basic editor. */
export function parsePhantasyStar4Rules(bytes: Uint8Array): PhantasyStar4Rules | undefined {
  if (
    bytes.length < minimumSize ||
    bytes.length > phantasyStar4RomLimit ||
    !matches(bytes, 0x100, "SEGA MEGA DRIVE") ||
    !matches(bytes, 0x120, "PHANTASY STAR") ||
    !matches(bytes, 0x160, "V1.6 By Ken Tse")
  )
    return;
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Corroborate the reviewed table layout against the game's own load instructions.
  if (
    data.getUint16(0x5f878) !== 0x45f9 ||
    data.getUint32(0x5f87a) !== itemTable ||
    data.getUint16(0x3e5c) !== 0x47fa ||
    0x3e5e + data.getInt16(0x3e5e) !== growthPointers
  )
    return;
  const growth: { first: number; techniques: number[]; skills: number[] }[] = [];
  let previousEnd = growthPointers + layout.persons.count * 6;
  for (let character = 0; character < layout.persons.count; character++) {
    const first = data.getUint16(growthPointers + character * 6);
    const pointer = data.getUint32(growthPointers + character * 6 + 2);
    const end = pointer + (99 - first) * rowSize;
    if (first < 1 || first > 99 || pointer % 2 || pointer < previousEnd || end > itemTable) return;
    previousEnd = end;
    const techniques = Array<number>(100).fill(0);
    const skills = Array<number>(100).fill(0);
    let previousExperience = 0;
    for (let level = first; level < 99; level++) {
      const offset = pointer + (level - first) * rowSize;
      const experience = data.getUint32(offset);
      const health = data.getUint16(offset + 4);
      const energy = data.getUint16(offset + 6);
      const technique = data.getUint8(offset + 12);
      const skill = data.getUint8(offset + 13);
      if (
        experience < previousExperience ||
        experience > 9_999_999 ||
        health === 0 ||
        health > 0x7fff ||
        energy > 0x7fff ||
        technique >= layout.techniqueCount ||
        skill >= layout.skillCount
      )
        return;
      previousExperience = experience;
      techniques[level] = technique === 0 ? 0 : 1;
      skills[level] = skill === 0 ? 0 : 1;
    }
    for (let level = 98; level >= first; level--) {
      techniques[level] = (techniques[level] ?? 0) + (techniques[level + 1] ?? 0);
      skills[level] = (skills[level] ?? 0) + (skills[level + 1] ?? 0);
    }
    if ((techniques[first] ?? 0) > 16 || (skills[first] ?? 0) > 8) return;
    growth.push({ first, techniques, skills });
  }
  const equipment = Array.from({ length: layout.itemCount }, (_, id) => {
    const offset = itemTable + (id - 1) * rowSize + 11;
    const bonus = (index: number) => (id === 0 ? 0 : data.getInt8(offset + index));
    return Object.freeze({
      strength: bonus(0),
      mental: bonus(1),
      agility: bonus(2),
      dexterity: bonus(3),
      attack: bonus(4),
      defence: bonus(5),
      magicDefence: bonus(6),
    });
  });
  return {
    equipment: Object.freeze(equipment),
    remainingLearning(character, level) {
      const entry = growth[character];
      if (
        !Number.isInteger(character) ||
        !entry ||
        !Number.isInteger(level) ||
        level < entry.first ||
        level > 99
      )
        throw new EditorError("invalid_edit", message("editor.invalidEdit"));
      return { techniques: entry.techniques[level] ?? 0, skills: entry.skills[level] ?? 0 };
    },
  };
}
