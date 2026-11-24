import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import type { San3Document } from "./document.ts";
import { inspectSan3Lists, type San3RelocationWrite } from "./relocation.ts";

export interface San3ArmyDraft {
  soldiers: number;
  training?: number;
  morale?: number;
}

const invalid = () => new EditorError("invalid_edit", message("editor.invalidEdit"));

/** Cheap control eligibility; the transaction separately validates every membership list. */
export function canSwitchSan3Army(document: San3Document, index: number) {
  const base = document.offset("officers", index);
  const officer = document.officer(index);
  const governor =
    officer.available && document.read(document.offset("cities", officer.city) + 4, 2) === index;
  const task = document.read(base + 26, 1);
  return (
    officer.available &&
    document.city(officer.city).faction === officer.faction &&
    document.read(document.offset("cities", officer.city) + 4, 2) !== 65535 &&
    (officer.role <= 3 || (officer.role === 4 && governor)) &&
    (document.read(base + 8, 1) & 0x1c) === 0 &&
    (document.read(base + 9, 1) & 0x7f) === 0 &&
    (document.read(base + 10, 1) & 15) === 0 &&
    (task === 0 || task === 255) &&
    document.read(base + 27, 1) === 0
  );
}

/** Direct army editing does not simulate the native recruitment command or charge its costs. */
export function editSan3Army(document: San3Document, index: number, draft: San3ArmyDraft) {
  const base = document.offset("officers", index);
  const officer = document.officer(index);
  const lists = inspectSan3Lists(document);
  const membership = lists.membership.get(index);
  if (
    !canSwitchSan3Army(document, index) ||
    membership?.kind !== "serving" ||
    !Number.isSafeInteger(draft.soldiers) ||
    draft.soldiers < 0 ||
    draft.soldiers > officer.soldierLimit
  )
    throw invalid();
  const starting = officer.soldiers === 0;
  const training = draft.training ?? (starting ? 0 : officer.training);
  const morale = draft.morale ?? (starting ? 0 : officer.morale);
  if (
    !Number.isSafeInteger(training) ||
    training < 0 ||
    training > 100 ||
    !Number.isSafeInteger(morale) ||
    morale < 0 ||
    morale > 120 ||
    (draft.soldiers === 0 && ((draft.training ?? 0) !== 0 || (draft.morale ?? 0) !== 0))
  )
    throw invalid();

  const bytes = document.copy();
  const data = new DataView(bytes.buffer);
  const writes: San3RelocationWrite[] = [];
  const write = (relative: number, width: 1 | 2, after: number) => {
    const offset = base + relative;
    const before = document.read(offset, width);
    if (before === after) return;
    writes.push({ offset, width, before, after });
    if (width === 1) data.setUint8(offset, after);
    else data.setUint16(offset, after);
  };
  // Native disband routine 0x14e56 clears troops, training, morale and equipment.
  // Equipment is already empty here; reservation changes belong to combat transactions.
  write(2, 2, draft.soldiers);
  write(21, 1, draft.soldiers ? training : 0);
  write(22, 1, draft.soldiers ? morale : 0);
  return { bytes, writes };
}
