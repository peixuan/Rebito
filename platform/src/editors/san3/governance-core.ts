import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import { San3Document, san3Layout } from "./document.ts";
import { san3ListContext } from "./list-context.ts";

export const invalidGovernance = () =>
  new EditorError("invalid_edit", message("san3.invalidGovernance"));

/** Leadership changes require an intact capital and all existing membership chains. */
export function inspectSan3Governance(document: San3Document) {
  const graph = san3ListContext(document);
  const factionCities = Array.from({ length: san3Layout.factions.count }, (_, faction) => {
    const cities: number[] = [];
    const { ruler, active } = document.faction(faction);
    if (!active) return cities;
    let pointer = document.read(document.offset("factions", faction) + 2, 4);
    while (pointer !== 0) {
      const city = (pointer - san3Layout.cities.offset) / san3Layout.cities.stride;
      cities.push(city);
      pointer = document.read(pointer, 4);
    }
    if (graph.cities[cities[0] ?? -1]?.serving[0] !== ruler) throw invalidGovernance();
    return cities;
  });
  return { ...graph, factionCities };
}

/** Preserve mission, recovery, covert and battle transitions for their own workflows. */
export function requireIdleGovernor(document: San3Document, index: number): void {
  const base = document.offset("officers", index);
  const task = document.read(base + 26, 1);
  if (
    (document.read(base + 8, 1) & 0x1c) !== 0 ||
    (document.read(base + 9, 1) & 0x7f) !== 0 ||
    (document.read(base + 11, 1) & 0x1f) !== 0 ||
    (task !== 0 && task !== 0xff) ||
    document.read(base + 27, 1) !== 0
  )
    throw invalidGovernance();
}

/** Collect the final writes once; the input and all returned buffers are independent. */
export function governanceEdit(document: San3Document) {
  const bytes = document.copy();
  const data = new DataView(bytes.buffer);
  const writes = new Map<
    number,
    { offset: number; width: 1 | 2 | 4; before: number; after: number }
  >();
  const write = (offset: number, width: 1 | 2 | 4, after: number) => {
    writes.set(offset, { offset, width, before: document.read(offset, width), after });
    if (width === 1) data.setUint8(offset, after);
    else if (width === 2) data.setUint16(offset, after);
    else data.setUint32(offset, after);
  };
  return {
    write,
    serving(city: number, officers: readonly number[]) {
      write(document.offset("cities", city) + 4, 2, officers[0] ?? 0xffff);
      for (const [position, index] of officers.entries())
        write(document.offset("officers", index), 2, officers[position + 1] ?? 0xffff);
    },
    cities(faction: number, cities: readonly number[]) {
      write(
        document.offset("factions", faction) + 2,
        4,
        cities.length ? document.offset("cities", cities[0] as number) : 0,
      );
      for (const [position, city] of cities.entries())
        write(
          document.offset("cities", city),
          4,
          position + 1 < cities.length
            ? document.offset("cities", cities[position + 1] as number)
            : 0,
        );
    },
    finish() {
      inspectSan3Governance(new San3Document(bytes));
      return {
        bytes,
        writes: [...writes.values()]
          .filter(({ before, after }) => before !== after)
          .sort((a, b) => a.offset - b.offset),
      };
    },
  };
}
