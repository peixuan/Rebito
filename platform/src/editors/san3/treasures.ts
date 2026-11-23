import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import { San3Document, san3Layout } from "./document.ts";
import { decodeSan3Name } from "./names.ts";
import { inspectSan3Lists, type San3RelocationWrite } from "./relocation.ts";

export const san3TreasureLayout = { owners: 0x787aa, definitions: 0x45620, count: 13 } as const;
const none = 0xffff;
const invalidSave = () => new EditorError("invalid_save", message("editor.invalidSave"));
const invalidEdit = () => new EditorError("invalid_edit", message("editor.invalidEdit"));

/** Thirteen items: item zero is a shared book, not a fourteenth ownership bit. */
export function inspectSan3Treasures(document: San3Document) {
  const masks = Array.from({ length: san3Layout.officers.count }, (_, index) =>
    document.read(document.offset("officers", index) + 4, 2),
  );
  const copies = masks.map((mask) => mask >>> 13);
  const total = document.read(san3TreasureLayout.owners, 2);
  if (total > 7 || copies.reduce((sum, count) => sum + count, 0) !== total) throw invalidSave();
  for (const [index, mask] of masks.entries()) {
    // Unused native records can retain bit0 with a zero quantity; preserve them.
    if (
      Boolean(mask & 1) !== Boolean(copies[index]) &&
      ((copies[index] ?? 0) > 0 || document.officer(index).role <= 6)
    )
      throw invalidSave();
  }
  const items = Array.from({ length: san3TreasureLayout.count }, (_, index) => {
    const base = san3TreasureLayout.definitions + index * 18;
    const name = decodeSan3Name(
      Uint8Array.from({ length: 13 }, (_, n) => document.read(base + 5 + n, 1)),
    );
    const owner = document.read(san3TreasureLayout.owners + index * 2, 2);
    if (index > 0) {
      if (owner > 601 && owner !== none) throw invalidSave();
      const holders = masks.flatMap((mask, officer) => (mask & (1 << index) ? [officer] : []));
      if (owner < 600 ? holders.length !== 1 || holders[0] !== owner : holders.length !== 0)
        throw invalidSave();
    }
    return {
      index,
      name,
      owner: index === 0 ? null : owner,
      readonly: index > 0 && (owner === 600 || owner === 601),
    };
  });
  const hiddenSealCities = Array.from(
    { length: san3Layout.cities.count },
    (_, city) => city,
  ).filter((city) => (document.read(document.offset("cities", city) + 0x17, 1) & 0x40) !== 0);
  if (hiddenSealCities.length > 1 || (hiddenSealCities.length > 0 && items[12]?.owner !== none))
    throw invalidSave();
  return { items, masks, copies, total, hiddenSealCities };
}

/** Shared source/recipient guard; callers need not attempt hundreds of transactions. */
export function san3TreasureRecipients(document: San3Document): number[] {
  const { membership } = inspectSan3Lists(document);
  return [...membership]
    .filter(([index, { kind }]) => {
      const base = document.offset("officers", index);
      const task = document.read(base + 0x1a, 1);
      return (
        kind !== "hidden" &&
        (document.read(base + 8, 1) & 0x1c) === 0 &&
        (document.read(base + 9, 1) & 0x7f) === 0 &&
        (document.read(base + 11, 1) & 0x0f) === 0 &&
        (task === 0 || task === 0xff) &&
        document.read(base + 0x1b, 1) === 0
      );
    })
    .map(([index]) => index);
}

/**
 * Transfer ownership and its redundant officer mask together. Ability bonuses
 * are computed by the game; base abilities are never adjusted by this operation.
 * Book quantities share a world limit of seven and are validated as a final draft.
 */
export function editSan3Treasures(document: San3Document, changes: Record<string, number>) {
  const inventory = inspectSan3Treasures(document);
  const recipients = new Set(san3TreasureRecipients(document));
  const eligible = (index: number) => {
    if (!recipients.has(index)) throw invalidEdit();
  };
  const owners = inventory.items.map((item) => item.owner);
  const copies = [...inventory.copies];
  const masks = [...inventory.masks];
  const edits: {
    key: string;
    index: number;
    kind: "owner" | "copies";
    before: number;
    after: number;
  }[] = [];
  for (const [key, after] of Object.entries(changes)) {
    if (!Number.isSafeInteger(after)) throw invalidEdit();
    const item = /^treasure\.([1-9]|1[0-2])\.owner$/.exec(key);
    const book = /^book\.(0|[1-9]\d{0,2})\.copies$/.exec(key);
    if (item) {
      const index = Number(item[1]);
      const before = owners[index];
      if (
        before === undefined ||
        before === null ||
        (after !== none && (after < 0 || after >= 600))
      )
        throw invalidEdit();
      if (before === after) continue;
      // Event custodians are not officers; preserve their unreconciled quest state.
      if (before === 600 || before === 601) throw invalidEdit();
      if (before < 600) eligible(before);
      if (after !== none) eligible(after);
      owners[index] = after;
      if (before < 600) masks[before] = (masks[before] ?? 0) & ~(1 << index);
      if (after !== none) masks[after] = (masks[after] ?? 0) | (1 << index);
      edits.push({ key, index, kind: "owner", before, after });
    } else if (book) {
      const index = Number(book[1]);
      const before = copies[index];
      if (before === undefined || after < 0 || after > 7) throw invalidEdit();
      if (before === after) continue;
      eligible(index);
      copies[index] = after;
      masks[index] = ((masks[index] ?? 0) & 0x1ffe) | (after << 13) | (after > 0 ? 1 : 0);
      edits.push({ key, index, kind: "copies", before, after });
    } else throw invalidEdit();
  }
  const total = copies.reduce((sum, count) => sum + count, 0);
  if (total > 7) throw invalidEdit();
  const bytes = document.copy();
  const data = new DataView(bytes.buffer);
  const writes: San3RelocationWrite[] = [];
  const write = (offset: number, width: 1 | 2, after: number) => {
    const before = document.read(offset, width);
    if (before === after) return;
    writes.push({ offset, width, before, after });
    if (width === 1) data.setUint8(offset, after);
    else data.setUint16(offset, after);
  };
  write(san3TreasureLayout.owners, 2, total);
  for (let index = 1; index < owners.length; index++)
    write(san3TreasureLayout.owners + index * 2, 2, owners[index] ?? none);
  for (const [index, mask] of masks.entries())
    write(document.offset("officers", index) + 4, 2, mask);
  // Finding the seal consumes its city discovery marker, as does native discovery.
  if (owners[12] !== none)
    for (const city of inventory.hiddenSealCities) {
      const offset = document.offset("cities", city) + 0x17;
      write(offset, 1, document.read(offset, 1) & ~0x40);
    }
  inspectSan3Treasures(new San3Document(bytes));
  writes.sort((left, right) => left.offset - right.offset);
  return { bytes, writes, edits };
}
