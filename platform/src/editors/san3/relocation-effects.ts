import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import type { San3Document } from "./document.ts";
import type { inspectSan3Lists, San3RelocationWrite } from "./relocation.ts";

type Lists = ReturnType<typeof inspectSan3Lists>;
const invalid = () => new EditorError("invalid_edit", message("san3.invalidRelocation"));
const taskBit = (kind: number) => (kind === 7 ? 0 : 1 << Math.min(kind, 7));

/** Resolve departures without moving list pointers; the caller publishes the complete move. */
export function prepareSan3Relocation(
  document: San3Document,
  graph: Lists,
  indices: readonly number[],
  faction: number,
) {
  const bytes = document.copy();
  const data = new DataView(bytes.buffer);
  const changes = new Map<number, San3RelocationWrite>();
  const write = (offset: number, width: 1 | 2, after: number) => {
    const before = document.read(offset, width);
    if (width === 1) data.setUint8(offset, after);
    else data.setUint16(offset, after);
    changes.set(offset, { offset, width, before, after });
  };
  const selected = new Set(indices);
  const cancelledTasks: { index: number; kind: number }[] = [];
  const refunds: { city: number; stock: string; requested: number; returned: number }[] = [];
  const affectedTasks = new Map<number, Set<number>>();
  for (const index of indices) {
    const base = document.offset("officers", index);
    const member = graph.membership.get(index);
    if (!member || (document.read(base + 8, 1) & 0x14) !== 0) throw invalid();
    const status = document.read(base + 9, 1);
    const task = document.read(base + 26, 1);
    if ((status & 64) !== 0) {
      if (member.kind !== "serving" || task > 8) throw invalid();
      cancelledTasks.push({ index, kind: task });
      const kinds = affectedTasks.get(member.city) ?? new Set<number>();
      kinds.add(task);
      affectedTasks.set(member.city, kinds);
    }
    // Native 13b96 clears only this participant, including all stale clock/result bytes.
    write(base + 9, 1, status & ~64);
    write(base + 26, 1, 255);
    write(base + 27, 1, 0);
    write(base + 28, 2, 0);
    write(base + 8, 1, document.read(base + 8, 1) & ~1);
    if (member.kind === "serving" && document.read(base + 17, 1) === faction) continue;

    const city = document.offset("cities", member.city);
    const equipment = document.read(base + 10, 1) & 15;
    const weapon = equipment & 3;
    const ship = equipment >> 2;
    const refund = (relative: number, width: 1 | 2, amount: number, stock: string) => {
      const offset = city + relative;
      const before = width === 1 ? data.getUint8(offset) : data.getUint16(offset);
      const max = width === 1 ? 100 : 9999;
      if (before > max) throw invalid();
      const returned = Math.min(amount, max - before);
      write(offset, width, before + returned);
      refunds.push({ city: member.city, stock, requested: amount, returned });
    };
    // Native 13926 returns floor(troops/100) weapons and at most one vessel.
    if (member.kind === "serving" && weapon)
      refund(
        [0, 40, 36, 38][weapon] as number,
        2,
        Math.floor(document.read(base + 2, 2) / 100),
        ["", "warhorses", "crossbows", "heavyCrossbows"][weapon] as string,
      );
    if (member.kind === "serving" && ship) {
      const stock = ["", "heavyWarships", "mediumWarships", "lightWarships"][ship] as string;
      if ((document.read(city + 21, 1) & 128) !== 0) refund(42 + ship, 1, 1, stock);
      else refunds.push({ city: member.city, stock, requested: 1, returned: 0 });
    }
    // Allegiance changes explicitly release the former army and covert commitments.
    write(base + 2, 2, 0);
    write(base + 8, 1, data.getUint8(base + 8) & ~8);
    write(base + 9, 1, status & 128);
    write(base + 10, 1, document.read(base + 10, 1) & 240);
    write(base + 11, 1, document.read(base + 11, 1) & 224);
    write(base + 15, 1, faction === 255 ? 0 : 100);
    write(base + 18, 1, faction === 255 ? 0 : 1);
    write(base + 19, 1, 255);
    for (const relative of [20, 21, 22]) write(base + relative, 1, 0);
  }
  for (const [city, kinds] of affectedTasks) {
    const offset = document.offset("cities", city) + 24;
    let flags = document.read(offset, 1);
    for (const kind of kinds) {
      const remaining = graph.cities[city]?.serving.some((index) => {
        const base = document.offset("officers", index);
        return (
          !selected.has(index) &&
          (document.read(base + 9, 1) & 64) !== 0 &&
          document.read(base + 26, 1) === kind
        );
      });
      if (!remaining) flags &= ~taskBit(kind);
    }
    write(offset, 1, flags);
  }
  return {
    bytes,
    writes: [...changes.values()].filter(({ before, after }) => before !== after),
    cancelledTasks,
    refunds,
  };
}
