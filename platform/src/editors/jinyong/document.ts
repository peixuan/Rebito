import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";

/** Original DOS R1/R2/R3.GRP layout; no inference of MOD or GRP32 structures. */
export const layout = {
  size: 114_242,
  inventory: { offset: 36, count: 200, stride: 4 },
  persons: { offset: 836, count: 320, stride: 182, nameOffset: 8, nameLength: 10 },
  items: { offset: 59_076, count: 200, stride: 190, nameOffset: 2, nameLength: 20 },
  scenes: { offset: 97_076, count: 84, stride: 52, nameOffset: 2, nameLength: 10 },
  skills: { offset: 101_444, count: 93, stride: 136, nameOffset: 2, nameLength: 10 },
  shops: { offset: 114_092, count: 5, stride: 30 },
} as const;
export type NamedTable = "persons" | "items" | "scenes" | "skills";

/** Copies its input, validates record boundaries and keeps non-editable bytes opaque. */
export class JinyongDocument {
  private readonly bytes: Uint8Array;
  private readonly data: DataView;

  constructor(bytes: Uint8Array) {
    const invalid = () => new EditorError("invalid_save", message("editor.invalidSave"));
    if (bytes.length !== layout.size) throw invalid();
    this.bytes = new Uint8Array(bytes);
    this.data = new DataView(this.bytes.buffer);
    for (const name of ["persons", "items", "scenes", "skills"] as const) {
      const table = layout[name];
      for (let index = 0; index < table.count; index++)
        if (this.word(table.offset + index * table.stride) !== index) throw invalid();
    }
    const team = Array.from({ length: 6 }, (_, index) => this.word(24 + index * 2));
    if (team[0] !== 0 || team.some((id) => id < -1 || id >= layout.persons.count)) throw invalid();
    const seen = new Set<number>();
    for (const { id, amount } of this.inventory()) {
      if (id < -1 || id >= layout.items.count || amount < 0 || (id !== -1 && seen.has(id)))
        throw invalid();
      if (id !== -1) seen.add(id);
    }
  }

  word(offset: number, unsigned = false): number {
    return unsigned ? this.data.getUint16(offset, true) : this.data.getInt16(offset, true);
  }

  name(tableName: NamedTable, index: number): string {
    const table = layout[tableName];
    if (!Number.isInteger(index) || index < 0 || index >= table.count)
      throw new EditorError("invalid_edit", message("editor.selectRecord"));
    const offset = table.offset + index * table.stride + table.nameOffset;
    const raw = this.bytes.subarray(offset, offset + table.nameLength);
    const terminator = raw.indexOf(0);
    // Names are game-owned Big5 text, never markup or translation identifiers.
    return new TextDecoder("big5")
      .decode(terminator < 0 ? raw : raw.subarray(0, terminator))
      .replace(/[\p{Cc}\p{Cf}]/gu, "")
      .trim();
  }

  inventory() {
    return Array.from({ length: layout.inventory.count }, (_, index) => {
      const offset = layout.inventory.offset + index * layout.inventory.stride;
      return { id: this.word(offset), amount: this.word(offset + 2) };
    });
  }

  inParty(index: number): boolean {
    return Array.from({ length: 6 }, (_, slot) => this.word(24 + slot * 2)).includes(index);
  }

  copy(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}
