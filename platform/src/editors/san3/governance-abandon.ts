import { San3Document, san3Layout } from "./document.ts";
import {
  governanceEdit,
  inspectSan3Governance,
  invalidGovernance,
  requireIdleGovernor,
} from "./governance-core.ts";
import { placeSan3Unaffiliated } from "./governance-presence.ts";
import { inspectSan3Treasures } from "./treasures.ts";

/**
 * Abandon a noncapital city while retaining its residents and their belongings.
 * First move a capital by succession; merge a one-city faction before abandoning
 * its former capital. A running city's command must finish before it changes owner.
 */
export function abandonSan3City(document: San3Document, city: number) {
  const base = document.offset("cities", city);
  const graph = inspectSan3Governance(document);
  const target = graph.cities[city];
  if (
    !target ||
    target.faction === 255 ||
    graph.factionCities[target.faction]?.[0] === city ||
    document.read(0x7dc2a, 4) === base ||
    (document.read(base + 22, 1) & 0x41) !== 0
  )
    throw invalidGovernance();
  for (const index of target.serving) {
    requireIdleGovernor(document, index);
    if ((document.read(document.offset("officers", index) + 10, 1) & 15) !== 0)
      throw invalidGovernance();
  }
  for (const [index, member] of graph.membership) {
    const officer = document.offset("officers", index);
    if (
      member.kind === "serving" &&
      (document.read(officer + 9, 1) & 64) !== 0 &&
      document.read(officer + 26, 1) === 7 &&
      document.read(officer + 28, 1) === city
    )
      throw invalidGovernance();
  }
  inspectSan3Treasures(document);
  const edit = governanceEdit(document);
  let head = target.free[0] ?? 65535;
  for (const index of [...target.serving].reverse()) {
    placeSan3Unaffiliated(document, edit, index, city, 5, head);
    head = index;
  }
  edit.cities(
    target.faction,
    (graph.factionCities[target.faction] ?? []).filter((index) => index !== city),
  );
  edit.write(base, 4, 0);
  edit.write(base + 4, 2, 65535);
  edit.write(base + 10, 2, 65535);
  // Native neutral-city cleanup preserves the port and hidden-seal markers.
  for (const [relative, mask] of [
    [21, 0x8f],
    [22, 0x30],
    [23, 0x40],
  ] as const)
    edit.write(base + relative, 1, document.read(base + relative, 1) & mask);
  for (const relative of [24, 25]) edit.write(base + relative, 1, 0);
  for (const relative of [20, 26, 27]) edit.write(base + relative, 1, 255);
  const cancelledJointAgreements: number[] = [];
  for (let faction = 0; faction < san3Layout.factions.count; faction++) {
    const offset = document.offset("factions", faction);
    if (document.read(offset + 36, 1) !== 255 && document.read(offset + 37, 1) === city) {
      edit.write(offset + 36, 1, 255);
      cancelledJointAgreements.push(faction);
    }
  }
  const result = edit.finish();
  inspectSan3Treasures(new San3Document(result.bytes));
  return {
    ...result,
    change: {
      city,
      faction: target.faction,
      advisor: target.advisor,
      cancelledJointAgreements,
      officers: target.serving.map((index) => ({
        index,
        role: document.officer(index).role,
        soldiersRemoved: document.read(document.offset("officers", index) + 2, 2),
      })),
    },
  };
}
