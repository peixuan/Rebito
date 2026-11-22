import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";

/** Japanese Mega-CD edition: guest-order sub-68000 program RAM, not main RAM. */
export const san3Layout = {
  size: 0x80000,
  cities: { offset: 0x787c4, count: 46, stride: 0x34 },
  factions: { offset: 0x79148, count: 21, stride: 0x32 },
  officers: { offset: 0x79562, count: 600, stride: 0x1e },
  historical: { offset: 0x4021e, count: 532, stride: 0x1e },
  custom: { offset: 0x78004, count: 68, stride: 0x1c },
  territories: { offset: 0x44076, count: 46, stride: 0x1a },
} as const;

const invalid = () => new EditorError("invalid_save", message("editor.invalidSave"));
const invalidRecord = () => new EditorError("invalid_edit", message("editor.selectRecord"));
const decoder = new TextDecoder("shift_jis");

/** Copies its input; relationship pointers and unverified fields remain opaque. */
export class San3Document {
  private readonly bytes: Uint8Array;
  private readonly data: DataView;

  constructor(bytes: Uint8Array) {
    if (bytes.length !== san3Layout.size) throw invalid();
    this.bytes = new Uint8Array(bytes);
    this.data = new DataView(this.bytes.buffer);
    if (
      this.read(0x78000, 4) !== 0x4b4f4549 ||
      this.read(0x78776, 4) !== 0x4b4f4549 ||
      this.read(0x78788, 2) < 1 ||
      this.read(0x78788, 2) > 9999 ||
      this.read(0x7878a, 1) > 11 ||
      // Overlay loader: 0 = UCOM; nonzero selects battle/setup/title/ending code.
      this.read(0x4abc4, 2) !== 0
    )
      throw invalid();
    let activeFactions = 0;
    for (let index = 0; index < san3Layout.factions.count; index++) {
      const offset = this.offset("factions", index);
      const ruler = this.read(offset, 2);
      if (ruler === 0xffff) continue;
      const city = this.cityIndex(this.read(offset + 2, 4));
      if (ruler >= san3Layout.officers.count || city === null) throw invalid();
      if (this.read(this.offset("cities", city) + 0x14, 1) !== index) throw invalid();
      activeFactions++;
    }
    if (!activeFactions) throw invalid();
    for (let index = 0; index < san3Layout.cities.count; index++) {
      const offset = this.offset("cities", index);
      const next = this.read(offset, 4);
      if (next !== 0 && this.cityIndex(next) === null) throw invalid();
      for (const relative of [4, 6, 8, 10]) {
        const officer = this.read(offset + relative, 2);
        if (officer !== 0xffff && officer >= san3Layout.officers.count) throw invalid();
      }
      const faction = this.read(offset + 0x14, 1);
      if (
        faction !== 0xff &&
        (faction >= san3Layout.factions.count || !this.faction(faction).active)
      )
        throw invalid();
      if (
        this.read(offset + 0x0c, 2) > 30_000 ||
        this.read(offset + 0x0e, 2) > 50_000 ||
        this.read(offset + 0x10, 4) > 3_000_000
      )
        throw invalid();
    }
  }

  read(offset: number, width: 1 | 2 | 4): number {
    if (width === 1) return this.data.getUint8(offset);
    return width === 2 ? this.data.getUint16(offset) : this.data.getUint32(offset);
  }

  offset(table: "cities" | "factions" | "officers", index: number): number {
    const layout = san3Layout[table];
    if (!Number.isInteger(index) || index < 0 || index >= layout.count) throw invalidRecord();
    return layout.offset + index * layout.stride;
  }

  private cityIndex(pointer: number): number | null {
    const index = (pointer - san3Layout.cities.offset) / san3Layout.cities.stride;
    return Number.isInteger(index) && index >= 0 && index < san3Layout.cities.count ? index : null;
  }

  private name(offset: number, length = 7): string {
    const bytes = this.bytes.subarray(offset, offset + length);
    const end = bytes.indexOf(0);
    // The game also has private glyphs. Do not invent names for undecodable text.
    const name = decoder.decode(end < 0 ? bytes : bytes.subarray(0, end));
    return name.includes("\ufffd")
      ? ""
      : name
          .replace(/[\p{Cc}\p{Cf}]/gu, "")
          .normalize("NFKC")
          .trim();
  }

  city(index: number) {
    const offset = this.offset("cities", index);
    const territory = san3Layout.territories.offset + index * san3Layout.territories.stride;
    return {
      index,
      name: this.name(territory + 10) || this.name(territory + 17, 9),
      faction: this.read(offset + 0x14, 1),
      population: this.read(offset + 0x0c, 2) * 100,
      gold: this.read(offset + 0x0e, 2),
      food: this.read(offset + 0x10, 4),
    };
  }

  faction(index: number) {
    const offset = this.offset("factions", index);
    const ruler = this.read(offset, 2);
    return { index, ruler, active: ruler < san3Layout.officers.count };
  }

  officer(index: number) {
    const offset = this.offset("officers", index);
    const historical = index < san3Layout.historical.count;
    const base = historical
      ? san3Layout.historical.offset + index * san3Layout.historical.stride
      : san3Layout.custom.offset + (index - san3Layout.historical.count) * san3Layout.custom.stride;
    const land = this.read(base + (historical ? 5 : 4), 1);
    const naval = this.read(base + (historical ? 6 : 5), 1);
    const role = this.read(offset + 0x0c, 1);
    const city = this.read(offset + 0x10, 1);
    const faction = this.read(offset + 0x11, 1);
    const available =
      role <= 4 &&
      city < san3Layout.cities.count &&
      faction < san3Layout.factions.count &&
      this.faction(faction).active &&
      land <= 100 &&
      naval <= 100;
    return {
      index,
      name: this.name(base + (historical ? 15 : 13)) || (historical ? this.name(base + 22, 8) : ""),
      role,
      city,
      faction,
      available,
      soldiers: this.read(offset + 2, 2),
      // Game allocation routine 0x117b2 uses the greater leadership attribute.
      soldierLimit: 10_000 + Math.max(land, naval) * 100,
      loyalty: this.read(offset + 0x0f, 1),
      training: this.read(offset + 0x15, 1),
      morale: this.read(offset + 0x16, 1),
    };
  }

  copy(): Uint8Array {
    return this.bytes.slice();
  }
}
