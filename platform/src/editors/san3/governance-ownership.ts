import { type San3Document, san3Layout } from "./document.ts";
import { adoptSan3Officers } from "./governance-allegiance.ts";
import {
  governanceEdit,
  inspectSan3Governance,
  invalidGovernance,
  requireIdleGovernor,
} from "./governance-core.ts";

/**
 * Transfer a noncapital city together with its serving officers. A neutral city
 * needs an explicit governor. Resources and resident armies stay in their city;
 * a governor arriving from elsewhere follows the relocation disbanding policy.
 */
export function transferSan3City(
  document: San3Document,
  city: number,
  faction: number,
  governor?: number,
) {
  const cityBase = document.offset("cities", city);
  document.offset("factions", faction);
  const graph = inspectSan3Governance(document);
  const target = graph.cities[city];
  if (
    !target ||
    !document.faction(faction).active ||
    target.faction === faction ||
    // The running native command can cache this city's former faction on its stack.
    document.read(0x7dc2a, 4) === cityBase
  )
    throw invalidGovernance();
  const previousFaction = target.faction;
  const neutral = previousFaction === 255;
  if (!neutral && graph.factionCities[previousFaction]?.[0] === city) throw invalidGovernance();
  const selected = governor ?? target.serving[0];
  if (selected === undefined) throw invalidGovernance();
  const officerBase = document.offset("officers", selected);
  const source = graph.membership.get(selected);
  if (!source || graph.rulers.has(selected)) throw invalidGovernance();
  if (neutral) {
    if (
      (source.city === city ? source.kind === "serving" : source.kind !== "serving") ||
      (source.city !== city &&
        (graph.cities[source.city]?.faction !== faction ||
          graph.cities[source.city]?.serving[0] === selected)) ||
      (document.read(officerBase + 10, 1) & 15) !== 0
    )
      throw invalidGovernance();
  } else if (selected !== target.serving[0]) {
    // Appoint a different resident governor as a separately previewed operation.
    throw invalidGovernance();
  }
  const officers = neutral ? [selected] : target.serving;
  for (const index of officers) requireIdleGovernor(document, index);
  // A hostile mission must not silently become an attack against its own city.
  for (let index = 0; index < san3Layout.officers.count; index++) {
    const base = document.offset("officers", index);
    if (
      document.read(base + 17, 1) === faction &&
      (document.read(base + 9, 1) & 64) !== 0 &&
      document.read(base + 26, 1) === 7 &&
      document.read(base + 28, 1) === city
    )
      throw invalidGovernance();
  }
  const edit = governanceEdit(document);
  const soldiersRemoved =
    neutral && source.kind === "serving" ? document.read(officerBase + 2, 2) : 0;
  if (neutral) {
    const origin = graph.cities[source.city];
    if (!origin) throw invalidGovernance();
    const remaining = origin[source.kind].filter((index) => index !== selected);
    const head = { serving: 4, free: 6, hidden: 8 }[source.kind];
    edit.write(document.offset("cities", source.city) + head, 2, remaining[0] ?? 65535);
    for (const [position, index] of remaining.entries())
      edit.write(document.offset("officers", index), 2, remaining[position + 1] ?? 65535);
    if (origin.advisor === selected)
      edit.write(
        document.offset("cities", source.city) + 10,
        2,
        remaining.find(
          (index) => document.read(document.offset("officers", index) + 12, 1) === 1,
        ) ?? 65535,
      );
    edit.serving(city, [selected]);
    edit.write(cityBase + 10, 2, 65535);
    edit.write(cityBase + 23, 1, (document.read(cityBase + 23, 1) & ~3) | 2);
    edit.write(officerBase + 2, 2, 0);
    edit.write(officerBase + 8, 1, document.read(officerBase + 8, 1) & ~1);
    edit.write(officerBase + 12, 1, 4);
    edit.write(officerBase + 16, 1, city);
    edit.write(officerBase + 21, 1, 0);
    edit.write(officerBase + 22, 1, 0);
  } else {
    edit.cities(
      previousFaction,
      (graph.factionCities[previousFaction] ?? []).filter((index) => index !== city),
    );
  }
  edit.cities(faction, [...(graph.factionCities[faction] ?? []), city]);
  edit.write(cityBase + 20, 1, faction);
  const allegiances = adoptSan3Officers(document, edit, officers, faction);
  return {
    ...edit.finish(),
    change: {
      city,
      previousFaction,
      faction,
      governor: selected,
      previousCity: source.city,
      soldiersRemoved,
      allegiances,
    },
  };
}
