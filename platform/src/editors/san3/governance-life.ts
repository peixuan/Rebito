import { San3Document } from "./document.ts";
import {
  governanceEdit,
  inspectSan3Governance,
  invalidGovernance,
  requireIdleGovernor,
} from "./governance-core.ts";
import { placeSan3Unaffiliated, requireSan3Definition } from "./governance-presence.ts";
import { inspectSan3Treasures, san3TreasureLayout } from "./treasures.ts";

/**
 * Native death detaches the officer and transfers belongings to their ruler.
 * Leadership and active missions must be resolved explicitly before this action.
 * Stored army bytes are retired with the officer; revival never restores that army.
 */
export function removeSan3Officer(document: San3Document, index: number) {
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
  const city = graph.cities[member.city];
  if (!city) throw invalidGovernance();
  const inventory = inspectSan3Treasures(document);
  const mask = inventory.masks[index] ?? 0;
  const copies = inventory.copies[index] ?? 0;
  const recipient = member.kind === "serving" ? document.faction(city.faction).ruler : 65535;
  if (mask && recipient !== 65535) requireIdleGovernor(document, recipient);
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
  edit.write(base, 2, 65535);
  edit.write(base + 8, 1, document.read(base + 8, 1) | 16);
  edit.write(base + 4, 2, 0);
  const items = inventory.items
    .filter((item) => item.index > 0 && item.owner === index)
    .map((item) => item.index);
  for (const item of items) edit.write(san3TreasureLayout.owners + item * 2, 2, recipient);
  if (recipient !== 65535) {
    const recipientMask = inventory.masks[recipient] ?? 0;
    const totalCopies = (inventory.copies[recipient] ?? 0) + copies;
    edit.write(
      document.offset("officers", recipient) + 4,
      2,
      ((recipientMask | mask) & 0x1ffe) | (totalCopies << 13) | (totalCopies ? 1 : 0),
    );
  } else edit.write(san3TreasureLayout.owners, 2, inventory.total - copies);
  const result = edit.finish();
  inspectSan3Treasures(new San3Document(result.bytes));
  return {
    ...result,
    change: {
      index,
      city: member.city,
      recipient,
      items,
      copies,
      soldiersRemoved: member.kind === "serving" ? document.read(base + 2, 2) : 0,
      advisorRemoved: city.advisor === index,
    },
  };
}

/** Revive into a named city's free list; do not recreate obsolete armies or missions. */
export function reviveSan3Officer(document: San3Document, index: number, city: number) {
  const base = document.offset("officers", index);
  document.offset("cities", city);
  const graph = inspectSan3Governance(document);
  const target = graph.cities[city];
  if (
    !target ||
    graph.membership.has(index) ||
    graph.rulers.has(index) ||
    (document.read(base + 8, 1) & 16) === 0
  )
    throw invalidGovernance();
  requireSan3Definition(document, index);
  const inventory = inspectSan3Treasures(document);
  if ((inventory.masks[index] ?? 0) !== 0) throw invalidGovernance();
  const edit = governanceEdit(document);
  placeSan3Unaffiliated(document, edit, index, city, 5, target.free[0] ?? 65535);
  return {
    ...edit.finish(),
    change: {
      index,
      city,
      previousRole: document.read(base + 12, 1),
      previousCity: document.read(base + 16, 1),
      previousFaction: document.read(base + 17, 1),
    },
  };
}
