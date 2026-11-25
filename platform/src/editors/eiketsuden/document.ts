import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";

/** Original DOS MSAVE[0-4].R3S; scene state belongs to the paired ESAVE file. */
export const layout = {
  size: 8_789,
  money: 35,
  characters: { offset: 1_685, count: 384, stride: 18 },
  itemSlots: 8,
  itemCount: 63,
  classCount: 19,
} as const;

export interface EiketsudenCharacter {
  faction: number;
  role: number;
  troops: number;
  troopClass: number;
  level: number;
  experience: number;
  items: number[];
}

/** Owns its bytes; unknown header, state flags and trailing tables remain opaque. */
export class EiketsudenDocument {
  private readonly bytes: Uint8Array;
  private readonly data: DataView;

  constructor(bytes: Uint8Array) {
    const invalid = () => new EditorError("invalid_save", message("editor.invalidSave"));
    if (bytes.length !== layout.size) throw invalid();
    this.bytes = new Uint8Array(bytes);
    this.data = new DataView(this.bytes.buffer);
    for (let index = 0; index < layout.characters.count; index++) {
      const row = this.character(index);
      if (
        row.faction > 14 ||
        row.role > 5 ||
        row.troopClass >= layout.classCount ||
        row.level < 1 ||
        row.level > 99 ||
        row.experience > 99
      )
        throw invalid();
    }
  }

  characterOffset(index: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= layout.characters.count)
      throw new EditorError("invalid_edit", message("editor.selectRecord"));
    return layout.characters.offset + index * layout.characters.stride;
  }

  character(index: number): EiketsudenCharacter {
    const offset = this.characterOffset(index);
    return {
      faction: this.data.getUint8(offset) & 0x7f,
      role: this.data.getUint8(offset + 1),
      troops: this.data.getUint16(offset + 5, true),
      troopClass: this.data.getUint8(offset + 7),
      level: this.data.getUint8(offset + 8),
      experience: this.data.getUint8(offset + 9),
      // Unknown item IDs are retained and displayed; they are never silently emptied.
      items: Array.from({ length: layout.itemSlots }, (_, slot) =>
        this.data.getUint8(offset + 10 + slot),
      ),
    };
  }

  money(): number {
    return this.data.getUint16(layout.money, true);
  }

  inParty(index: number): boolean {
    const { faction, role } = this.character(index);
    return faction === 0 && (role === 0 || role === 2);
  }

  copy(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}
