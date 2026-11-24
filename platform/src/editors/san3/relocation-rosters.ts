import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import { type San3Document, san3Layout } from "./document.ts";
import type { inspectSan3Lists } from "./relocation.ts";

const invalid = () => new EditorError("invalid_edit", message("san3.invalidRelocation"));
type Graph = ReturnType<typeof inspectSan3Lists>;

/** Rebuild complete rosters and capital chains after validated departure effects. */
export function rebuildSan3RelocationRosters(
  document: San3Document,
  graph: Graph,
  indices: readonly number[],
  destination: number,
  prepared: Uint8Array,
) {
  const selected = new Set(indices);
  const bytes = new Uint8Array(prepared);
  const data = new DataView(bytes.buffer);
  const writes = new Map<
    number,
    { offset: number; width: 1 | 2 | 4; before: number; after: number }
  >();
  const write = (offset: number, width: 1 | 2 | 4, after: number) => {
    if (width === 1) data.setUint8(offset, after);
    else if (width === 2) data.setUint16(offset, after);
    else data.setUint32(offset, after);
    writes.set(offset, { offset, width, before: document.read(offset, width), after });
  };
  const cities = graph.cities.map((city) => ({
    ...city,
    serving: city.serving.filter((index) => !selected.has(index)),
    free: city.free.filter((index) => !selected.has(index)),
    hidden: city.hidden.filter((index) => !selected.has(index)),
  }));
  const target = cities[destination];
  if (!target) throw invalid();
  const ruler = indices.find((index) => graph.rulers.has(index));
  if (ruler !== undefined) {
    if (indices.some((index) => index !== ruler && graph.rulers.has(index))) throw invalid();
    if (document.officer(ruler).faction !== target.faction) throw invalid();
    target.serving.unshift(ruler);
  }
  target[target.faction === 255 ? "free" : "serving"].push(
    ...indices.filter((index) => index !== ruler),
  );
  for (const index of indices) {
    const base = document.offset("officers", index);
    const before = document.officer(index);
    const same = before.faction === target.faction && before.faction !== 255;
    const role = same
      ? before.role === 4 && data.getUint16(base + 2) > 0
        ? 3
        : before.role
      : target.faction === 255
        ? 5
        : 4;
    write(base + 12, 1, role);
    write(base + 16, 1, destination);
    write(base + 17, 1, target.faction);
  }
  const abandoned: number[] = [];
  for (const [city, lists] of cities.entries()) {
    const original = graph.cities[city];
    if (!original) throw invalid();
    const base = document.offset("cities", city);
    const oldGovernor = original.serving[0];
    const governor = lists.serving[0];
    if (oldGovernor !== governor) {
      if (oldGovernor !== undefined && lists.serving.includes(oldGovernor)) {
        const old = document.offset("officers", oldGovernor);
        if (data.getUint8(old + 12) === 4 && data.getUint16(old + 2) > 0) write(old + 12, 1, 3);
      }
      if (governor !== undefined) {
        const role = data.getUint8(document.offset("officers", governor) + 12);
        write(base + 23, 1, (document.read(base + 23, 1) & ~3) | (role >= 3 ? 2 : 0));
      } else if (original.faction !== 255) {
        // UCOM can retain the current city's owner on its stack until the command exits.
        if (document.read(0x7dc2a, 4) === base)
          throw new EditorError("invalid_edit", message("san3.relocationCurrentCityEmpty"));
        if ((document.read(base + 22, 1) & 0x41) !== 0)
          throw new EditorError("invalid_edit", message("san3.relocationCityBattle"));
        abandoned.push(city);
        lists.faction = 255;
        write(base, 4, 0);
        for (const [relative, mask] of [
          [21, 0x8f],
          [22, 0x30],
          [23, 0x40],
        ] as const)
          write(base + relative, 1, document.read(base + relative, 1) & mask);
        for (const relative of [24, 25]) write(base + relative, 1, 0);
        for (const relative of [20, 26, 27]) write(base + relative, 1, 255);
      }
    }
    if (
      selected.has(lists.advisor) ||
      (oldGovernor !== governor && (lists.advisor === governor || lists.advisor === 65535))
    )
      lists.advisor =
        lists.serving.find(
          (index) =>
            index !== governor && data.getUint8(document.offset("officers", index) + 12) === 1,
        ) ?? 65535;
    for (const [kind, relative] of [
      ["serving", 4],
      ["free", 6],
      ["hidden", 8],
    ] as const) {
      write(base + relative, 2, lists[kind][0] ?? 65535);
      for (const [position, index] of lists[kind].entries())
        write(document.offset("officers", index), 2, lists[kind][position + 1] ?? 65535);
    }
    write(base + 10, 2, lists.advisor);
  }
  const capitals: { faction: number; before: number; after: number }[] = [];
  const cancelledAgreements: number[] = [];
  for (let faction = 0; faction < san3Layout.factions.count; faction++) {
    const base = document.offset("factions", faction);
    if (!document.faction(faction).active) continue;
    if (document.read(base + 36, 1) !== 255 && abandoned.includes(document.read(base + 37, 1))) {
      write(base + 36, 1, 255);
      cancelledAgreements.push(faction);
    }
    const chain: number[] = [];
    for (let pointer = document.read(base + 2, 4); pointer; pointer = document.read(pointer, 4))
      chain.push((pointer - san3Layout.cities.offset) / san3Layout.cities.stride);
    const rulerIndex = document.faction(faction).ruler;
    const before = chain[0];
    if (before === undefined || graph.cities[before]?.serving[0] !== rulerIndex) throw invalid();
    const capital = data.getUint8(document.offset("officers", rulerIndex) + 16);
    const remaining = chain.filter((city) => !abandoned.includes(city) && city !== capital);
    if (cities[capital]?.serving[0] !== rulerIndex) throw invalid();
    const ordered = [capital, ...remaining];
    write(base + 2, 4, document.offset("cities", capital));
    for (const [position, city] of ordered.entries())
      write(
        document.offset("cities", city),
        4,
        position + 1 < ordered.length
          ? document.offset("cities", ordered[position + 1] as number)
          : 0,
      );
    if (capital !== before) capitals.push({ faction, before, after: capital });
  }
  const cancelledSpies: number[] = [];
  for (const [index, member] of graph.membership) {
    const base = document.offset("officers", index);
    if (
      member.kind === "serving" &&
      (data.getUint8(base + 9) & 64) !== 0 &&
      data.getUint8(base + 26) === 7 &&
      abandoned.includes(data.getUint8(base + 28))
    ) {
      write(base + 9, 1, data.getUint8(base + 9) & ~64);
      write(base + 26, 1, 255);
      write(base + 27, 1, 0);
      write(base + 28, 2, 0);
      cancelledSpies.push(index);
    }
  }
  return {
    bytes,
    writes: [...writes.values()].filter(({ before, after }) => before !== after),
    abandoned,
    capitals,
    cancelledAgreements,
    cancelledSpies,
  };
}
