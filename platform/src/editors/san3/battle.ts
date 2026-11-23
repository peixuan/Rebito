import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import { san3Layout } from "./document.ts";
import type { San3Field } from "./fields.ts";
import { decodeSan3Name } from "./names.ts";

const invalidSave = () => new EditorError("invalid_save", message("editor.invalidSave"));
const invalidEdit = () => new EditorError("invalid_edit", message("editor.invalidEdit"));
const roster = { offset: 0x4b504, count: 8, stride: 12 };
const officerOffset = (index: number) => san3Layout.officers.offset + index * 30;

/** Land combat has an independent schema; strategic relationships are not writable here. */
export class San3BattleDocument {
  private readonly bytes: Uint8Array;
  private readonly data: DataView;
  private readonly members = new Map<number, number>();
  readonly selected: number;

  constructor(bytes: Uint8Array) {
    if (bytes.length !== san3Layout.size) throw invalidSave();
    this.bytes = new Uint8Array(bytes);
    this.data = new DataView(this.bytes.buffer);
    const word = (offset: number) => this.data.getUint16(offset);
    const long = (offset: number) => this.data.getUint32(offset);
    // HEX entry, mobility accessors and the Move counter's reader/writer identify this layout.
    if (
      long(0x78000) !== 0x4b4f4549 ||
      long(0x78776) !== 0x4b4f4549 ||
      word(0x78788) < 1 ||
      word(0x78788) > 9999 ||
      this.data.getUint8(0x7878a) > 11 ||
      word(0x4abc4) !== 1 ||
      word(0x52056) !== 0 ||
      long(0x54000) !== 0x4eba0c94 ||
      long(0x27ba4) !== 0x10280017 ||
      long(0x27bc4) !== 0x11420017 ||
      word(0x6532c) !== 0x4eb9 ||
      long(0x6532e) !== 0x27b92 ||
      word(0x65614) !== 0x4eb9 ||
      long(0x65616) !== 0x27bac
    )
      throw invalidSave();
    const sides = new Set<number>();
    for (let slot = 0; slot < roster.count; slot++) {
      const base = roster.offset + slot * roster.stride;
      let index = word(base + 6);
      if (index === 0xffff) continue;
      const faction = (long(base) - san3Layout.factions.offset) / san3Layout.factions.stride;
      if (!Number.isInteger(faction) || faction < 0 || faction >= san3Layout.factions.count)
        throw invalidSave();
      const factionBase = san3Layout.factions.offset + faction * san3Layout.factions.stride;
      const city = (long(factionBase + 2) - san3Layout.cities.offset) / san3Layout.cities.stride;
      if (
        word(factionBase) >= san3Layout.officers.count ||
        !Number.isInteger(city) ||
        city < 0 ||
        city >= san3Layout.cities.count ||
        this.bytes[san3Layout.cities.offset + city * san3Layout.cities.stride + 20] !== faction
      )
        throw invalidSave();
      sides.add(slot < 4 ? 0 : 1);
      while (index !== 0xffff) {
        if (index >= san3Layout.officers.count || this.members.has(index)) throw invalidSave();
        const offset = officerOffset(index);
        if (
          (this.data.getUint8(offset + 8) & 0x1c) !== 4 ||
          this.data.getUint8(offset + 12) > 3 ||
          this.data.getUint8(offset + 16) >= san3Layout.cities.count ||
          this.bytes[offset + 17] !== faction ||
          word(offset + 2) < 1 ||
          word(offset + 2) > 20_000 ||
          this.data.getUint8(offset + 21) > 100 ||
          // Combat morale gains call the native 120-capped increment routine.
          this.data.getUint8(offset + 22) > 120 ||
          this.data.getUint8(offset + 23) > 90
        )
          throw invalidSave();
        this.members.set(index, faction);
        index = word(offset);
      }
    }
    this.selected = word(0x52058);
    if (sides.size !== 2 || !this.members.has(this.selected)) throw invalidSave();
    // A deployed unit outside the reviewed army chains indicates an incomplete battle graph.
    for (let index = 0; index < san3Layout.officers.count; index++) {
      if ((this.data.getUint8(officerOffset(index) + 8) & 4) !== 0 && !this.members.has(index))
        throw invalidSave();
    }
  }

  indexes(): number[] {
    return [...this.members.keys()];
  }

  officer(index: number) {
    const faction = this.members.get(index);
    if (faction === undefined) throw invalidEdit();
    const historical = index < san3Layout.historical.count;
    const names = historical
      ? san3Layout.historical.offset + index * san3Layout.historical.stride + 15
      : san3Layout.custom.offset +
        (index - san3Layout.historical.count) * san3Layout.custom.stride +
        13;
    return {
      index,
      name: decodeSan3Name(this.bytes.subarray(names, names + 7)),
      faction,
      mobility: this.data.getUint8(officerOffset(index) + 23),
    };
  }

  copy(): Uint8Array {
    return this.bytes.slice();
  }
}

/** The 0–90 range preserves the original editor's range, not a claimed native maximum. */
export function battleFields(document: San3BattleDocument, index: number): San3Field[] {
  const officer = document.officer(index);
  return [
    {
      key: `battle.${index}.mobility`,
      label: message("san3.mobility"),
      group: message("san3.battle"),
      columnId: "mobility",
      offset: officerOffset(index) + 23,
      width: 1,
      value: officer.mobility,
      min: 0,
      max: 90,
      help: message("san3.battleMobilityHelp"),
    },
  ];
}

/** Move dialogs cache their counter: capture at the battle command menu before editing. */
export function editSan3Battle(document: San3BattleDocument, changes: Record<string, number>) {
  const edits = Object.entries(changes).map(([key, value]) => {
    const match = /^battle\.(0|[1-9]\d{0,2})\.mobility$/.exec(key);
    const field = match && battleFields(document, Number(match[1]))[0];
    if (!field || !Number.isSafeInteger(value) || value < field.min || value > field.max)
      throw invalidEdit();
    return { field, before: field.value, after: value };
  });
  const bytes = document.copy();
  for (const { field, after } of edits) bytes[field.offset] = after;
  return { bytes, edits };
}
