import { San3Document } from "./document.ts";
import {
  governanceEdit,
  inspectSan3Governance,
  invalidGovernance,
  requireIdleGovernor,
} from "./governance-core.ts";
import { requireSan3Definition, resetSan3OfficerPlacement } from "./governance-presence.ts";
import { inspectSan3Treasures } from "./treasures.ts";

/**
 * Withdraw a living nonleader from all city rosters without rewinding emergence.
 * The original appearance queue and definition stay untouched. A consumed event
 * will not repeat; manual introduction remains available for a later return.
 * Return treasures and equipment first, and resolve missions before withdrawal.
 */
export function withdrawSan3Officer(document: San3Document, index: number) {
  const base = document.offset("officers", index);
  const graph = inspectSan3Governance(document);
  const member = graph.membership.get(index);
  if (
    !member ||
    graph.rulers.has(index) ||
    document.read(0x7dc26, 2) === index ||
    graph.cities[member.city]?.serving[0] === index
  )
    throw invalidGovernance();
  requireIdleGovernor(document, index);
  requireSan3Definition(document, index);
  const inventory = inspectSan3Treasures(document);
  if ((document.read(base + 10, 1) & 15) !== 0 || inventory.masks[index] !== 0)
    throw invalidGovernance();
  const city = graph.cities[member.city];
  if (!city) throw invalidGovernance();
  const edit = governanceEdit(document);
  const remaining = city[member.kind].filter((candidate) => candidate !== index);
  edit.write(
    document.offset("cities", member.city) + { serving: 4, free: 6, hidden: 8 }[member.kind],
    2,
    remaining[0] ?? 65535,
  );
  for (const [position, candidate] of remaining.entries())
    edit.write(document.offset("officers", candidate), 2, remaining[position + 1] ?? 65535);
  if (city.advisor === index) edit.write(document.offset("cities", member.city) + 10, 2, 65535);
  // Apply the same fresh unaffiliated state, but never insert it into a city list.
  resetSan3OfficerPlacement(document, edit, index, 255, 5, 255);
  edit.write(base, 2, 65535);
  edit.write(base + 12, 1, 7);
  const result = edit.finish();
  inspectSan3Treasures(new San3Document(result.bytes));
  return {
    ...result,
    change: {
      index,
      city: member.city,
      previousRole: document.officer(index).role,
      previousFaction: document.officer(index).faction,
      soldiersRemoved: member.kind === "serving" ? document.read(base + 2, 2) : 0,
      advisorRemoved: city.advisor === index,
    },
  };
}
