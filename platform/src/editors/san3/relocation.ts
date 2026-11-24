import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import { San3Document, san3Layout } from "./document.ts";

const none = 0xffff;
const listHeads = { serving: 4, free: 6, hidden: 8 } as const;
type ListKind = keyof typeof listHeads;
type CityLists = Record<ListKind, number[]> & { faction: number; advisor: number };

export interface San3RelocationWrite {
  offset: number;
  width: 1 | 2;
  before: number;
  after: number;
}

const invalidGraph = () => new EditorError("invalid_save", message("editor.invalidSave"));
const invalidMove = (reason = "invalidRelocation") =>
  new EditorError("invalid_edit", message(`san3.${reason}`));

/** Validate the reachable lists; unused/dead records need not belong to a city. */
export function inspectSan3Lists(document: San3Document) {
  const membership = new Map<number, { city: number; kind: ListKind }>();
  const cities: CityLists[] = [];
  for (let city = 0; city < san3Layout.cities.count; city++) {
    const base = document.offset("cities", city);
    const lists: CityLists = {
      serving: [],
      free: [],
      hidden: [],
      faction: document.read(base + 0x14, 1),
      advisor: document.read(base + 10, 2),
    };
    for (const kind of Object.keys(listHeads) as ListKind[]) {
      let index = document.read(base + listHeads[kind], 2);
      while (index !== none) {
        // This also bounds traversal and rejects cycles shared between lists.
        if (index >= san3Layout.officers.count || membership.has(index)) throw invalidGraph();
        const officer = document.offset("officers", index);
        const role = document.read(officer + 0x0c, 1);
        if (
          (kind === "serving" ? role > 4 : role !== (kind === "free" ? 5 : 6)) ||
          document.read(officer + 0x10, 1) !== city ||
          document.read(officer + 0x11, 1) !== (kind === "serving" ? lists.faction : 0xff)
        )
          throw invalidGraph();
        membership.set(index, { city, kind });
        lists[kind].push(index);
        index = document.read(officer, 2);
      }
    }
    if (
      (lists.faction === 0xff) !== (lists.serving.length === 0) ||
      (lists.advisor !== none &&
        (!lists.serving.includes(lists.advisor) ||
          document.read(document.offset("officers", lists.advisor) + 0x0c, 1) !== 1))
    )
      throw invalidGraph();
    cities.push(lists);
  }

  const ownedCities = new Set<number>();
  const rulers = new Set<number>();
  for (let faction = 0; faction < san3Layout.factions.count; faction++) {
    const base = document.offset("factions", faction);
    const ruler = document.read(base, 2);
    if (ruler === none) continue;
    const rulerCity = membership.get(ruler);
    if (
      rulerCity?.kind !== "serving" ||
      cities[rulerCity.city]?.faction !== faction ||
      document.read(document.offset("officers", ruler) + 0x0c, 1) !== 0 ||
      rulers.has(ruler)
    )
      throw invalidGraph();
    rulers.add(ruler);
    let pointer = document.read(base + 2, 4);
    while (pointer !== 0) {
      const city = (pointer - san3Layout.cities.offset) / san3Layout.cities.stride;
      if (!Number.isInteger(city) || cities[city]?.faction !== faction || ownedCities.has(city))
        throw invalidGraph();
      ownedCities.add(city);
      pointer = document.read(pointer, 4);
    }
  }
  for (const [city, lists] of cities.entries()) {
    if ((lists.faction !== 0xff) !== ownedCities.has(city)) throw invalidGraph();
  }
  return { cities, membership, rulers };
}

/**
 * Move a batch atomically. Serving arrivals become civil officers; neutral-city
 * arrivals become free officers. As in the legacy tool, their armies are disbanded.
 * No recruitment, resurrection, battle transition or ownership change is implied.
 */
export function relocateSan3Officers(
  document: San3Document,
  indices: readonly number[],
  destination: number,
) {
  document.offset("cities", destination);
  const selected = new Set(indices);
  if (
    !indices.length ||
    indices.length > san3Layout.officers.count ||
    selected.size !== indices.length
  )
    throw invalidMove();
  const { cities, membership, rulers } = inspectSan3Lists(document);
  const target = cities[destination];
  if (!target) throw invalidMove();
  const destinationRole = target.faction === 0xff ? 5 : 4;
  const moves = indices.map((index) => {
    const base = document.offset("officers", index);
    const source = membership.get(index);
    const role = document.read(base + 0x0c, 1);
    const task = document.read(base + 0x1a, 1);
    if (!source) throw invalidMove("relocationNoRoster");
    if (source.city === destination) throw invalidMove();
    if (role === 0 || rulers.has(index)) throw invalidMove("relocationRuler");
    if (cities[source.city]?.serving[0] === index) throw invalidMove("relocationGovernor");
    if ((document.read(base + 8, 1) & 0x14) !== 0) throw invalidMove("relocationBattleOrDead");
    if (
      (document.read(base + 8, 1) & 8) !== 0 ||
      (task !== 0 && task !== 0xff) ||
      document.read(base + 0x1b, 1) !== 0
    )
      throw invalidMove("relocationTask");
    if ((document.read(base + 9, 1) & 0x7f) !== 0) throw invalidMove("relocationStatus");
    // Native unequipping refunds the allocated stock before relocation disbands troops.
    if ((document.read(base + 10, 1) & 15) !== 0 || (document.read(base + 11, 1) & 15) !== 0)
      throw invalidMove("relocationEquipment");
    return {
      index,
      fromCity: source.city,
      toCity: destination,
      fromFaction: document.read(base + 0x11, 1),
      toFaction: target.faction,
      fromRole: role,
      toRole: destinationRole,
      // Free/hidden records can retain a troop placeholder without a serving army.
      soldiersRemoved: role <= 4 ? document.read(base + 2, 2) : 0,
    };
  });

  for (const lists of cities) {
    for (const kind of Object.keys(listHeads) as ListKind[])
      lists[kind] = lists[kind].filter((index) => !selected.has(index));
    if (selected.has(lists.advisor))
      lists.advisor =
        lists.serving.find(
          (index) => document.read(document.offset("officers", index) + 12, 1) === 1,
        ) ?? none;
  }
  target[target.faction === 0xff ? "free" : "serving"].push(...indices);

  const bytes = document.copy();
  const view = new DataView(bytes.buffer);
  const writes: San3RelocationWrite[] = [];
  const write = (offset: number, width: 1 | 2, after: number) => {
    const before = document.read(offset, width);
    if (before === after) return;
    writes.push({ offset, width, before, after });
    if (width === 1) view.setUint8(offset, after);
    else view.setUint16(offset, after);
  };
  for (const [city, lists] of cities.entries()) {
    const base = document.offset("cities", city);
    for (const kind of Object.keys(listHeads) as ListKind[]) {
      write(base + listHeads[kind], 2, lists[kind][0] ?? none);
      for (const [position, index] of lists[kind].entries())
        write(document.offset("officers", index), 2, lists[kind][position + 1] ?? none);
    }
    write(base + 10, 2, lists.advisor);
  }
  for (const index of indices) {
    const base = document.offset("officers", index);
    write(base + 2, 2, 0);
    write(base + 0x15, 1, 0);
    write(base + 0x16, 1, 0);
    write(base + 8, 1, document.read(base + 8, 1) & ~1);
    write(base + 12, 1, destinationRole);
    write(base + 16, 1, destination);
    write(base + 17, 1, target.faction);
    if (target.faction !== 0xff) write(base + 15, 1, 100);
  }
  inspectSan3Lists(new San3Document(bytes));
  writes.sort((left, right) => left.offset - right.offset);
  return { bytes, moves, writes };
}
