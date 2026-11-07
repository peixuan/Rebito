import { MessageError, message } from "../../shared/messages.ts";
import { companionRecords, personAction, sailorRecords } from "./companions.ts";
import {
  type Changes,
  type Context,
  type Field,
  readField,
  validateValue,
  writeField,
} from "./fields.ts";
import { mainRecords } from "./main.ts";
import { personRecords } from "./persons.ts";

export const layout = { header: 0x97, slot: 0x8074, slots: 10, size: 328_991 } as const;
export interface Slot {
  index: number;
  active: boolean;
  date: string;
  hero: number;
}
export const modules = [
  { id: "main", label: message("koukai2.main"), records: mainRecords },
  { id: "persons", label: message("koukai2.persons"), records: personRecords },
  { id: "companions", label: message("koukai2.companions"), records: companionRecords },
  { id: "sailors", label: message("koukai2.affiliation"), records: sailorRecords },
];

/** Pure binary model. Unknown bytes and untouched out-of-range values survive. */
export class KoukaiDocument {
  private readonly bytes: Uint8Array;
  readonly slots: readonly Slot[];

  constructor(bytes: Uint8Array) {
    if (bytes.length !== layout.size) throw new MessageError(message("koukai2.saveSize"));
    this.bytes = new Uint8Array(bytes);
    this.slots = Array.from({ length: layout.slots }, (_, index) => {
      const offset = 1 + index * 15;
      const active = bytes[offset] !== 0;
      const date = active
        ? new TextDecoder("ascii").decode(bytes.subarray(offset, offset + 11))
        : "";
      const hero = active ? (bytes[layout.header + index * layout.slot + 0x611] ?? 255) : -1;
      if (active) {
        const parts = date.split("/");
        const [day, month, year] = parts.map(Number);
        if (
          !/^[ 0-9]{2}\/[ 0-9]{3}\/[0-9]{4}$/.test(date) ||
          !parts.every((part) => /^ *\d+$/.test(part)) ||
          !day ||
          day > 31 ||
          !month ||
          month > 12 ||
          !year ||
          hero > 5
        )
          throw new MessageError(message("koukai2.saveHeader"));
      }
      return Object.freeze({ index, active, date, hero });
    });
    if (!this.slots.some((slot) => slot.active)) throw new MessageError(message("koukai2.noSlots"));
  }

  private context(slot: number): Context {
    const selected = this.slots[slot];
    if (!Number.isInteger(slot) || !selected?.active)
      throw new MessageError(message("koukai2.selectSlot"));
    return { bytes: this.bytes, base: layout.header + slot * layout.slot, hero: selected.hero };
  }
  records(slot: number, moduleId: string) {
    const module = modules.find((entry) => entry.id === moduleId);
    if (!module) throw new MessageError(message("koukai2.unknownModule"));
    return module.records(this.context(slot));
  }
  fields(slot: number): Map<string, Field> {
    const context = this.context(slot);
    const fields = new Map<string, Field>();
    for (const module of modules)
      for (const record of module.records(context))
        for (const field of record.fields) fields.set(field.key, field);
    return fields;
  }
  value(field: Field) {
    return readField(this.bytes, field);
  }
  preview(slot: number, changes: Changes) {
    const fields = this.fields(slot);
    return Object.entries(changes)
      .map(([key, after]) => {
        const field = fields.get(key);
        if (!field) throw new MessageError(message("koukai2.unknownField", { key }));
        validateValue(field, after);
        return { field, before: this.value(field), after };
      })
      .filter(({ before, after }) => before !== after);
  }
  render(slot: number, changes: Changes): Uint8Array {
    const preview = this.preview(slot, changes);
    const result = new Uint8Array(this.bytes);
    for (const { field, after } of preview) writeField(result, field, after);
    return result;
  }
  action(slot: number, action: string, record: string, pending: Changes = {}): Changes {
    const edited = new KoukaiDocument(this.render(slot, pending));
    const expanded = personAction(edited.context(slot), action, record);
    const combined = { ...pending, ...expanded };
    this.preview(slot, combined);
    return combined;
  }
}
