import { type San3Document, san3Layout } from "./document.ts";
import {
  governanceEdit,
  inspectSan3Governance,
  invalidGovernance,
  requireIdleGovernor,
} from "./governance-core.ts";
import { requireSan3Definition } from "./governance-presence.ts";
import { withdrawSan3Officer } from "./governance-withdrawal.ts";
import { inspectSan3Treasures } from "./treasures.ts";

/** Native automatic appearance scans registered ordinary slots, never the first eight rulers. */
export function inspectSan3CustomAppearance(document: San3Document, index: number) {
  const officer = document.offset("officers", index);
  const slot = index - san3Layout.historical.count;
  const scenario = document.read(0x7dc2e, 1);
  const currentYear = document.read(0x78788, 2);
  if (slot < 8 || slot >= 68 || scenario < 1 || scenario > 7 || !(document.read(0x7dc28, 1) & 4))
    throw invalidGovernance();
  const baseYear = document.read(0x478c8 + scenario * 2, 2);
  const minYear = currentYear + 1;
  const maxYear = Math.min(9999, baseYear + 254);
  if (baseYear < 1 || baseYear >= currentYear || minYear > maxYear) throw invalidGovernance();
  // Native 0x2a984 stops at the first unused portrait, rather than skipping a vacant slot.
  for (let candidate = 8; candidate <= slot; candidate++)
    requireSan3Definition(document, candidate + san3Layout.historical.count);
  if (Object.values(document.attributes(index)).some((value) => value < 1))
    throw invalidGovernance();
  const graph = inspectSan3Governance(document);
  const member = graph.membership.get(index);
  const role = document.officer(index).role;
  const next = document.read(officer, 2);
  requireIdleGovernor(document, index);
  if (
    graph.rulers.has(index) ||
    document.read(0x7dc26, 2) === index ||
    (member && graph.cities[member.city]?.serving[0] === index) ||
    (document.read(officer + 10, 1) & 15) !== 0 ||
    inspectSan3Treasures(document).masks[index] !== 0
  )
    throw invalidGovernance();
  if (
    !member &&
    (![7, 255].includes(role) ||
      // Native scenario initialization leaves unused links zero until first placement.
      (next !== 65535 && !(role === 255 && next === 0)) ||
      document.read(officer + 16, 1) !== 255 ||
      document.read(officer + 17, 1) !== 255 ||
      document.read(officer + 2, 2) !== 0 ||
      document.read(officer + 21, 1) !== 0 ||
      document.read(officer + 22, 1) !== 0)
  )
    throw invalidGovernance();
  const definition = san3Layout.custom.offset + slot * san3Layout.custom.stride;
  const offset = document.read(definition + 2, 1);
  const pending = role === 255;
  return {
    index,
    slot,
    currentYear,
    baseYear,
    minYear,
    maxYear,
    offset,
    pending,
    scheduledYear: pending && offset !== 255 ? baseYear + offset : null,
  };
}

/**
 * Schedule a future native appearance in a game-chosen city. Detach current membership
 * coherently; preserve the original event queue, campaign options and definition data.
 * Role 255 is the native pending state; role 7 alone never triggers this yearly scan.
 */
export function scheduleSan3CustomAppearance(document: San3Document, index: number, year: number) {
  const state = inspectSan3CustomAppearance(document, index);
  if (!Number.isSafeInteger(year) || year < state.minYear || year > state.maxYear)
    throw invalidGovernance();
  const original = document.officer(index);
  const member = inspectSan3Governance(document).membership.get(index);
  const detached = member ? withdrawSan3Officer(document, index) : undefined;
  const edit = governanceEdit(document);
  for (const write of detached?.writes ?? []) edit.write(write.offset, write.width, write.after);
  edit.write(document.offset("officers", index) + 12, 1, 255);
  edit.write(
    san3Layout.custom.offset + state.slot * san3Layout.custom.stride + 2,
    1,
    year - state.baseYear,
  );
  return {
    ...edit.finish(),
    change: {
      index,
      year,
      previousYear: state.scheduledYear,
      previousRole: original.role,
      previousCity: original.city,
      previousFaction: original.faction,
      soldiersRemoved: detached?.change.soldiersRemoved ?? 0,
      advisorRemoved: detached?.change.advisorRemoved ?? false,
    },
  };
}
