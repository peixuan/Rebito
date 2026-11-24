import type { San3Document } from "./document.ts";
import {
  governanceEdit,
  inspectSan3Governance,
  invalidGovernance,
  requireIdleGovernor,
  updateSan3RulerCache,
} from "./governance-core.ts";

/**
 * The successor remains in their own city, which becomes the new capital.
 * Preserve army allocations, diplomacy and human-control identity. This is an
 * explicit abdication policy, not the native death/succession event.
 */
export function succeedSan3RulerAcrossCities(
  document: San3Document,
  faction: number,
  successor: number,
) {
  const factionBase = document.offset("factions", faction);
  const successorBase = document.offset("officers", successor);
  const graph = inspectSan3Governance(document);
  const cities = graph.factionCities[faction];
  const oldCapital = cities?.[0];
  const candidate = graph.membership.get(successor);
  const previousRuler = document.read(factionBase, 2);
  if (
    !cities ||
    oldCapital === undefined ||
    candidate?.kind !== "serving" ||
    candidate.city === oldCapital ||
    graph.cities[candidate.city]?.faction !== faction ||
    graph.rulers.has(successor)
  )
    throw invalidGovernance();
  const newCapital = candidate.city;
  const target = graph.cities[newCapital];
  const oldGovernor = target?.serving[0];
  if (!target || oldGovernor === undefined) throw invalidGovernance();
  for (const index of new Set([previousRuler, successor, oldGovernor]))
    requireIdleGovernor(document, index);
  const previousBase = document.offset("officers", previousRuler);
  const governorBase = document.offset("officers", oldGovernor);
  const formerRulerRole = document.read(previousBase + 2, 2) > 0 ? 3 : 4;
  const governorRoleBefore = document.read(governorBase + 12, 1);
  const governorRoleAfter =
    oldGovernor !== successor && governorRoleBefore === 4 && document.read(governorBase + 2, 2) > 0
      ? 3
      : governorRoleBefore;
  const oldCityBase = document.offset("cities", oldCapital);
  const newCityBase = document.offset("cities", newCapital);
  const advisorAfter = target.advisor === successor ? 0xffff : target.advisor;
  const edit = governanceEdit(document);
  updateSan3RulerCache(document, faction, successor, edit.write);
  edit.write(factionBase, 2, successor);
  edit.cities(faction, [newCapital, ...cities.filter((city) => city !== newCapital)]);
  edit.serving(newCapital, [successor, ...target.serving.filter((index) => index !== successor)]);
  edit.write(newCityBase + 10, 2, advisorAfter);
  edit.write(newCityBase + 23, 1, document.read(newCityBase + 23, 1) & ~3);
  edit.write(oldCityBase + 23, 1, (document.read(oldCityBase + 23, 1) & ~3) | 2);
  if (oldGovernor !== successor) edit.write(governorBase + 12, 1, governorRoleAfter);
  edit.write(previousBase + 12, 1, formerRulerRole);
  edit.write(previousBase + 15, 1, 100);
  edit.write(successorBase + 12, 1, 0);
  edit.write(successorBase + 15, 1, 0);
  return {
    ...edit.finish(),
    change: {
      faction,
      oldCapital,
      newCapital,
      previousRuler,
      successor,
      formerRulerRole,
      oldGovernor,
      governorRoleBefore,
      governorRoleAfter: oldGovernor === successor ? 0 : governorRoleAfter,
      advisorBefore: target.advisor,
      advisorAfter,
    },
  };
}
