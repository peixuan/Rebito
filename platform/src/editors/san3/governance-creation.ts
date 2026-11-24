import { type San3Document, san3Layout } from "./document.ts";
import { adoptSan3Officers } from "./governance-allegiance.ts";
import {
  governanceEdit,
  inspectSan3Governance,
  invalidGovernance,
  requireIdleGovernor,
} from "./governance-core.ts";
import { inspectSan3TurnOrder } from "./turn-order.ts";

export interface San3FactionCreation {
  faction: number;
  city: number;
  ruler: number;
  human: number;
}

function creationContext(document: San3Document, faction: number) {
  document.offset("factions", faction);
  const graph = inspectSan3Governance(document);
  const queue = inspectSan3TurnOrder(document);
  const activeCount = graph.factionCities.filter((cities) => cities.length).length;
  if (
    document.faction(faction).active ||
    document.read(0x7878b, 1) !== activeCount ||
    document.read(0x7878c + faction, 1) > 24
  )
    throw invalidGovernance();
  const eligible = new Set<number>();
  for (const [city, target] of graph.cities.entries()) {
    const base = document.offset("cities", city);
    if (
      document.read(0x7dc2a, 4) === base ||
      (document.read(base + 22, 1) & 0x41) !== 0 ||
      graph.factionCities[target.faction]?.[0] === city
    )
      continue;
    const candidates = target.faction === 255 ? [...target.free, ...target.hidden] : target.serving;
    const idle = candidates.filter((index) => {
      if (graph.rulers.has(index)) return false;
      if (
        index >= san3Layout.historical.count &&
        document.read(
          san3Layout.custom.offset +
            (index - san3Layout.historical.count) * san3Layout.custom.stride,
          2,
        ) === 65535
      )
        return false;
      try {
        requireIdleGovernor(document, index);
        return true;
      } catch {
        return false;
      }
    });
    if (target.faction !== 255 && idle.length !== candidates.length) continue;
    for (const index of idle) eligible.add(index);
  }
  return { graph, queue, activeCount, eligible };
}

/** Inspect once for dropdown eligibility; never clone/edit RAM for each candidate. */
export function san3FactionFounders(document: San3Document, faction: number): number[] {
  return [...creationContext(document, faction).eligible];
}

/**
 * Found a faction in an unused slot, retaining the chosen city's residents.
 * Native independence initializes identity/relations separately from the icon and
 * turn queue. The editor keeps all serving followers instead of random defections.
 */
export function createSan3Faction(document: San3Document, request: San3FactionCreation) {
  const { faction, city, ruler, human } = request;
  const factionBase = document.offset("factions", faction);
  const cityBase = document.offset("cities", city);
  const rulerBase = document.offset("officers", ruler);
  const { graph, queue, activeCount, eligible } = creationContext(document, faction);
  const target = graph.cities[city];
  const member = graph.membership.get(ruler);
  if (!target || member?.city !== city || !eligible.has(ruler) || (human !== 0 && human !== 1))
    throw invalidGovernance();
  const neutral = target.faction === 255;
  const officers = neutral ? [ruler] : [ruler, ...target.serving.filter((id) => id !== ruler)];
  const edit = governanceEdit(document);
  if (neutral) {
    const remaining = target[member.kind].filter((id) => id !== ruler);
    edit.write(cityBase + (member.kind === "free" ? 6 : 8), 2, remaining[0] ?? 65535);
    for (const [position, index] of remaining.entries())
      edit.write(document.offset("officers", index), 2, remaining[position + 1] ?? 65535);
    // Unaffiliated records may retain retired army data; do not resurrect that army.
    edit.write(rulerBase + 2, 2, 0);
    edit.write(rulerBase + 10, 1, document.read(rulerBase + 10, 1) & 0xf0);
    edit.write(rulerBase + 21, 1, 0);
    edit.write(rulerBase + 22, 1, 0);
  } else {
    edit.cities(
      target.faction,
      (graph.factionCities[target.faction] ?? []).filter((id) => id !== city),
    );
  }
  edit.serving(city, officers);
  edit.write(
    cityBase + 10,
    2,
    officers.find((id) => id !== ruler && document.officer(id).role === 1) ?? 65535,
  );
  edit.write(cityBase + 20, 1, faction);
  edit.write(cityBase + 23, 1, document.read(cityBase + 23, 1) & ~3);
  for (const relative of [26, 27]) edit.write(cityBase + relative, 1, 255);
  edit.write(rulerBase + 12, 1, 0);
  if (neutral) edit.write(rulerBase + 8, 1, document.read(rulerBase + 8, 1) & ~1);
  const allegiances = adoptSan3Officers(document, edit, officers, faction);
  edit.write(factionBase, 2, ruler);
  edit.cities(faction, [city]);
  edit.write(factionBase + 12, 1, 0);
  for (const relative of [13, 14, 36, 37, 38, 42]) edit.write(factionBase + relative, 1, 255);
  edit.write(factionBase + 44, 2, 0);
  edit.write(factionBase + 46, 4, 0);
  const diplomacy = [];
  for (let index = 0; index < san3Layout.factions.count; index++) {
    const base = document.offset("factions", index);
    const allies = document.read(base + 6, 4);
    edit.write(base + 6, 4, (allies & ~(index === faction ? 0x1fffff : 1 << faction)) >>> 0);
    edit.write(factionBase + 15 + index, 1, 30);
    if (index !== faction && document.faction(index).active)
      edit.write(base + 15 + faction, 1, index === target.faction ? 100 : 30);
    const joint = document.read(base + 36, 1) === faction;
    const targetReference = document.read(base + 14, 1) === faction;
    if (joint) edit.write(base + 36, 1, 255);
    if (targetReference) edit.write(base + 14, 1, 255);
    if (joint || targetReference || allies & (1 << faction))
      diplomacy.push({
        faction: index,
        joint,
        targetReference,
        alliance: !!(allies & (1 << faction)),
      });
  }
  edit.write(0x7dc0a + faction, 1, human);
  edit.write(0x7878b, 1, activeCount + 1);
  const queuedPosition = queue.factions.indexOf(faction);
  return {
    ...edit.finish(),
    change: {
      faction,
      city,
      ruler,
      human,
      previousFaction: target.faction,
      previousRole: document.officer(ruler).role,
      previousAdvisor: target.advisor,
      advisor: officers.find((id) => id !== ruler && document.officer(id).role === 1) ?? 65535,
      allegiances,
      diplomacy,
      // Existing inactive queue slots can become active again; never insert a new slot mid-turn.
      upcomingPosition: queuedPosition > queue.cursor ? queuedPosition + 1 : null,
      soldiersRemoved: neutral ? document.read(rulerBase + 2, 2) : 0,
    },
  };
}
