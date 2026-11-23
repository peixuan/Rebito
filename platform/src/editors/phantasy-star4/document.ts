import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import type { PhantasyStar4Rules } from "./rules.ts";

/** Canonical big-endian Mega Drive work RAM, not an emulator's native heap or SRAM. */
export const layout = {
  size: 0x10000,
  party: { offset: 0xf40a, count: 5 },
  inventory: { offset: 0xf410, count: 40 },
  money: 0xf438,
  persons: { offset: 0xf500, count: 11, stride: 0x80 },
  itemCount: 161,
  techniqueCount: 41,
  skillCount: 55,
} as const;

export type FieldWidth = 1 | 2 | 4;

/** Owns a paused game's RAM and validates initialized records without claiming ROM identity. */
export class PhantasyStar4Document {
  private readonly bytes: Uint8Array;
  private readonly data: DataView;
  readonly rules: PhantasyStar4Rules | undefined;

  constructor(bytes: Uint8Array, rules?: PhantasyStar4Rules) {
    const invalid = () => new EditorError("invalid_save", message("editor.invalidSave"));
    if (bytes.length !== layout.size) throw invalid();
    this.bytes = new Uint8Array(bytes);
    this.data = new DataView(this.bytes.buffer);
    this.rules = rules;
    const party = this.party();
    const firstEmpty = party.indexOf(0xff);
    const members = party.filter((id) => id !== 0xff);
    if (
      members.length === 0 ||
      members.some((id) => id >= layout.persons.count) ||
      new Set(members).size !== members.length ||
      (firstEmpty >= 0 && party.slice(firstEmpty).some((id) => id !== 0xff)) ||
      this.read(layout.money, 4) > 9_999_999 ||
      this.inventory().some((id) => id >= layout.itemCount)
    )
      throw invalid();
    for (let index = 0; index < layout.persons.count; index++) {
      const offset = this.personOffset(index);
      const level = this.read(offset + 8, 2);
      const health = this.read(offset + 0x0e, 2);
      const maxHealth = this.read(offset + 0x10, 2);
      const energy = this.read(offset + 0x12, 2);
      const maxEnergy = this.read(offset + 0x14, 2);
      if (
        level < 1 ||
        level > 99 ||
        maxHealth === 0 ||
        maxHealth > 0x7fff ||
        maxEnergy > 0x7fff ||
        health > maxHealth ||
        energy > maxEnergy ||
        this.read(offset + 0x0a, 4) > 9_999_999
      )
        throw invalid();
    }
  }

  read(offset: number, width: FieldWidth = 1): number {
    if (!Number.isInteger(offset) || offset < 0 || offset + width > layout.size)
      throw new EditorError("invalid_edit", message("editor.invalidEdit"));
    if (width === 1) return this.data.getUint8(offset);
    if (width === 2) return this.data.getUint16(offset);
    return this.data.getUint32(offset);
  }

  personOffset(index: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= layout.persons.count)
      throw new EditorError("invalid_edit", message("editor.selectRecord"));
    return layout.persons.offset + index * layout.persons.stride;
  }

  party(): number[] {
    return Array.from({ length: layout.party.count }, (_, index) =>
      this.read(layout.party.offset + index),
    );
  }

  inventory(): number[] {
    return Array.from({ length: layout.inventory.count }, (_, index) =>
      this.read(layout.inventory.offset + index),
    );
  }

  inParty(index: number): boolean {
    this.personOffset(index);
    return this.party().includes(index);
  }

  copy(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}
