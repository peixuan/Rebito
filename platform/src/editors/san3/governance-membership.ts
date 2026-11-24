import { San3Document } from "./document.ts";
import {
  governanceEdit,
  inspectSan3Governance,
  invalidGovernance,
  requireIdleGovernor,
} from "./governance-core.ts";
import {
  placeSan3Unaffiliated,
  requireSan3Definition,
  requireUnplacedSan3Custom,
  resetSan3OfficerPlacement,
  san3RegistrationPortrait,
} from "./governance-presence.ts";
import { inspectSan3Treasures } from "./treasures.ts";

/**
 * Recruit, resign, hide, reveal or introduce an officer through complete lists.
 * Existing residents stay in their city; relocation remains a separate action.
 * Leaders hand over first, and allocated equipment or active missions are resolved
 * separately. Belongings remain with the officer; serving armies are disbanded.
 */
export function setSan3OfficerPresence(
  document: San3Document,
  index: number,
  role: number,
  destination?: number,
) {
  if (role !== 4 && role !== 5 && role !== 6) throw invalidGovernance();
  const base = document.offset("officers", index);
  const graph = inspectSan3Governance(document);
  const member = graph.membership.get(index);
  const previousRole = document.read(base + 12, 1);
  const city = destination ?? member?.city;
  if (city === undefined) throw invalidGovernance();
  document.offset("cities", city);
  const target = graph.cities[city];
  if (
    !target ||
    (document.read(base + 8, 1) & 16) !== 0 ||
    graph.rulers.has(index) ||
    document.read(0x7dc26, 2) === index ||
    (member
      ? member.city !== city || previousRole === role || target.serving[0] === index
      : previousRole !== 7 && previousRole !== 255)
  )
    throw invalidGovernance();
  if (role === 4 && (target.faction === 255 || member?.kind === "serving"))
    throw invalidGovernance();
  if (!member && previousRole === 255) requireUnplacedSan3Custom(document, index);
  const registration = !member ? san3RegistrationPortrait(document, index) : undefined;
  if (!registration) requireSan3Definition(document, index);
  if (member) requireIdleGovernor(document, index);
  if (member && (document.read(base + 10, 1) & 15) !== 0) throw invalidGovernance();
  const inventory = inspectSan3Treasures(document);
  const edit = governanceEdit(document);
  if (registration) edit.write(registration.offset, 2, registration.portrait);
  if (member) {
    const remaining = target[member.kind].filter((candidate) => candidate !== index);
    edit.write(
      document.offset("cities", city) + { serving: 4, free: 6, hidden: 8 }[member.kind],
      2,
      remaining[0] ?? 65535,
    );
    for (const [position, candidate] of remaining.entries())
      edit.write(document.offset("officers", candidate), 2, remaining[position + 1] ?? 65535);
    if (target.advisor === index) edit.write(document.offset("cities", city) + 10, 2, 65535);
  }
  if (role === 4) {
    resetSan3OfficerPlacement(document, edit, index, city, role, target.faction);
    edit.serving(city, [...target.serving, index]);
  } else {
    placeSan3Unaffiliated(
      document,
      edit,
      index,
      city,
      role,
      target[role === 5 ? "free" : "hidden"][0] ?? 65535,
    );
  }
  // Unused records may retain the book-presence bit with a zero quantity.
  if (!member && inventory.copies[index] === 0)
    edit.write(base + 4, 2, (inventory.masks[index] ?? 0) & ~1);
  const result = edit.finish();
  inspectSan3Treasures(new San3Document(result.bytes));
  return {
    ...result,
    change: {
      index,
      city,
      previousRole,
      role,
      faction: role === 4 ? target.faction : 255,
      previousFaction: document.read(base + 17, 1),
      introduced: !member,
      ...(registration ? { registeredPortrait: registration.portrait } : {}),
      soldiersRemoved: member?.kind === "serving" ? document.read(base + 2, 2) : 0,
      advisorRemoved: target.advisor === index,
    },
  };
}
