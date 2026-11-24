import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import { inspectSan3BattleReserves } from "./battle-reserves.ts";
import { san3Layout } from "./document.ts";
import { exchangeSan3Equipment } from "./equipment.ts";
import type { San3Field } from "./fields.ts";
import { decodeSan3Name } from "./names.ts";

const invalidSave = () => new EditorError("invalid_save", message("editor.invalidSave"));
const invalidEdit = () => new EditorError("invalid_edit", message("editor.invalidEdit"));
const roster = { offset: 0x4b504, count: 8, stride: 12 };
const officerOffset = (index: number) => san3Layout.officers.offset + index * 30;

/** Combat has an independent schema; strategic relationships are not writable here. */
export class San3BattleDocument {
  private readonly bytes: Uint8Array;
  private readonly data: DataView;
  private readonly members = new Map<number, number>();
  readonly selected: number;
  readonly naval: boolean;

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
      word(0x52056) > 1 ||
      long(0x54000) !== 0x4eba0c94 ||
      long(0x27ba4) !== 0x10280017 ||
      long(0x27bc4) !== 0x11420017 ||
      word(0x6532c) !== 0x4eb9 ||
      long(0x6532e) !== 0x27b92 ||
      word(0x65614) !== 0x4eb9 ||
      long(0x65616) !== 0x27bac
    )
      throw invalidSave();
    this.naval = word(0x52056) === 1;
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
    const outside = [];
    for (let index = 0; index < san3Layout.officers.count; index++) {
      if ((this.data.getUint8(officerOffset(index) + 8) & 4) !== 0 && !this.members.has(index))
        outside.push(index);
    }
    // Native retreat keeps the "already deployed" bit on a city-reserve record.
    if (outside.length) {
      const { retired } = inspectSan3BattleReserves(this.bytes, new Set(this.members.keys()));
      if (outside.some((index) => !retired.has(index))) throw invalidSave();
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
    const offset = officerOffset(index);
    const city = this.bytes[offset + 16] ?? 0xff;
    const cityBase = san3Layout.cities.offset + city * san3Layout.cities.stride;
    const attributes = historical
      ? san3Layout.historical.offset + index * san3Layout.historical.stride + 5
      : san3Layout.custom.offset +
        (index - san3Layout.historical.count) * san3Layout.custom.stride +
        4;
    const land = this.bytes[attributes] ?? 255;
    const naval = this.bytes[attributes + 1] ?? 255;
    const equipment = this.bytes[offset + 10] ?? 0;
    return {
      index,
      name: decodeSan3Name(this.bytes.subarray(names, names + 7)),
      faction,
      mobility: this.data.getUint8(officerOffset(index) + 23),
      soldiers: this.data.getUint16(offset + 2),
      soldierLimit: 10_000 + Math.max(land, naval) * 100,
      training: this.data.getUint8(offset + 21),
      morale: this.data.getUint8(offset + 22),
      weapon: equipment & 3,
      ship: (equipment >>> 2) & 3,
      canEquip: land <= 100 && naval <= 100 && this.bytes[cityBase + 20] === faction,
      port: ((this.bytes[cityBase + 21] ?? 0) & 0x80) !== 0,
    };
  }

  copy(): Uint8Array {
    return this.bytes.slice();
  }
}

/** The 0–90 range preserves the original editor's range, not a claimed native maximum. */
export function battleFields(document: San3BattleDocument, index: number): San3Field[] {
  const officer = document.officer(index);
  const fields: San3Field[] = [
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
  for (const [id, relative, width, maximum] of [
    ["soldiers", 2, 2, officer.soldierLimit],
    ["training", 21, 1, 100],
    ["morale", 22, 1, 120],
    ["weapon", 10, 1, 3],
    ["ship", 10, 1, 3],
  ] as const) {
    fields.push({
      key: `battle.${index}.${id}`,
      label: message(`san3.${id}`),
      group: message("san3.battle"),
      columnId: id,
      offset: officerOffset(index) + relative,
      width,
      value: officer[id],
      min: id === "soldiers" || (id === "ship" && document.naval) ? 1 : 0,
      max: maximum,
      ...(["soldiers", "weapon", "ship"].includes(id)
        ? {
            readonly: !officer.canEquip || (id === "ship" && !officer.port),
            help: message("san3.battleEquipmentHelp"),
          }
        : {}),
      ...(id === "weapon" || id === "ship"
        ? {
            choices: (id === "weapon"
              ? ["infantry", "warhorses", "crossbows", "heavyCrossbows"]
              : ["noShip", "heavyWarships", "mediumWarships", "lightWarships"]
            )
              .map((label, value) => ({ value, label: message(`san3.${label}`) }))
              .filter(({ value }) => id !== "ship" || !document.naval || value > 0),
          }
        : {}),
    });
  }
  return fields;
}

/** Move dialogs cache their counter: capture at the battle command menu before editing. */
export function editSan3Battle(document: San3BattleDocument, changes: Record<string, number>) {
  const edits = Object.entries(changes).map(([key, value]) => {
    const match =
      /^battle\.(0|[1-9]\d{0,2})\.(mobility|soldiers|training|morale|weapon|ship)$/.exec(key);
    const field =
      match && battleFields(document, Number(match[1])).find((field) => field.key === key);
    if (
      !field ||
      field.readonly ||
      !Number.isSafeInteger(value) ||
      value < field.min ||
      value > field.max
    )
      throw invalidEdit();
    return { field, before: field.value, after: value };
  });
  const equipped = new Set(
    edits
      .filter(({ field }) => ["soldiers", "weapon", "ship"].includes(field.columnId))
      .map(({ field }) => Number(field.key.split(".")[1])),
  );
  const result = exchangeSan3Equipment(
    document.copy(),
    [...equipped].map((index) => {
      const current = document.officer(index);
      return {
        index,
        soldiers: changes[`battle.${index}.soldiers`] ?? current.soldiers,
        weapon: changes[`battle.${index}.weapon`] ?? current.weapon,
        ship: changes[`battle.${index}.ship`] ?? current.ship,
      };
    }),
  );
  for (const { field, after } of edits)
    if (!["soldiers", "weapon", "ship"].includes(field.columnId))
      result.bytes[field.offset] = after;
  const inventory = result.writes.filter(
    ({ offset }) => offset >= san3Layout.cities.offset && offset < san3Layout.factions.offset,
  );
  return { bytes: result.bytes, edits, inventory };
}
