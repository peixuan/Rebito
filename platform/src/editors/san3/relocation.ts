import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import { San3Document, san3Layout } from "./document.ts";
import { prepareSan3Relocation } from "./relocation-effects.ts";
import { rebuildSan3RelocationRosters } from "./relocation-rosters.ts";

const none = 0xffff;
const listHeads = { serving: 4, free: 6, hidden: 8 } as const;
type ListKind = keyof typeof listHeads;
type CityLists = Record<ListKind, number[]> & { faction: number; advisor: number };

export interface San3RelocationWrite {
  offset: number;
  width: 1 | 2 | 4;
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
 * Move a batch atomically, retaining same-faction armies and maintaining offices.
 * Changing allegiance releases the former army; a ruler cannot implicitly merge
 * factions. Completed native commands must release their cached city first.
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
  const graph = inspectSan3Lists(document);
  const target = graph.cities[destination];
  if (!target) throw invalidMove();
  const moves = indices.map((index) => {
    const base = document.offset("officers", index);
    const source = graph.membership.get(index);
    const role = document.read(base + 0x0c, 1);
    if (!source) throw invalidMove("relocationNoRoster");
    if (source.city === destination) throw invalidMove();
    if (role === 0 && !graph.rulers.has(index)) throw invalidMove();
    if (graph.rulers.has(index) && document.read(base + 17, 1) !== target.faction)
      throw invalidMove("relocationRuler");
    if ((document.read(base + 8, 1) & 0x14) !== 0) throw invalidMove("relocationBattleOrDead");
    return {
      index,
      fromCity: source.city,
      toCity: destination,
      fromFaction: document.read(base + 0x11, 1),
      toFaction: target.faction,
      fromRole: role,
      toRole: target.faction === 0xff ? 5 : 4,
      soldiersRemoved: 0,
    };
  });
  const effects = prepareSan3Relocation(document, graph, indices, target.faction);
  const rosters = rebuildSan3RelocationRosters(
    document,
    graph,
    indices,
    destination,
    effects.bytes,
  );
  const output = new San3Document(rosters.bytes);
  inspectSan3Lists(output);
  const writes = new Map<number, San3RelocationWrite>();
  for (const entry of [...effects.writes, ...rosters.writes]) writes.set(entry.offset, entry);
  for (const move of moves) {
    const base = document.offset("officers", move.index);
    move.toRole = output.read(base + 12, 1);
    move.soldiersRemoved =
      move.fromRole <= 4 ? document.read(base + 2, 2) - output.read(base + 2, 2) : 0;
  }
  return {
    ...rosters,
    moves,
    cancelledTasks: effects.cancelledTasks,
    refunds: effects.refunds,
    writes: [...writes.values()].sort((left, right) => left.offset - right.offset),
  };
}
