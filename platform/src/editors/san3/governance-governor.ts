import type { San3Document } from "./document.ts";
import {
  governanceEdit,
  inspectSan3Governance,
  invalidGovernance,
  requireIdleGovernor,
} from "./governance-core.ts";

/** Shared read-only nomination checks; dropdowns must not simulate whole transactions. */
export function requireSan3GovernorCandidate(
  document: San3Document,
  city: number,
  successor: number,
) {
  const cityBase = document.offset("cities", city);
  const nextBase = document.offset("officers", successor);
  const graph = inspectSan3Governance(document);
  const lists = graph.cities[city];
  const previous = lists?.serving[0];
  const member = graph.membership.get(successor);
  if (
    !lists ||
    previous === undefined ||
    successor === previous ||
    member?.kind !== "serving" ||
    member.city !== city ||
    graph.rulers.has(previous) ||
    graph.rulers.has(successor)
  )
    throw invalidGovernance();
  requireIdleGovernor(document, previous);
  requireIdleGovernor(document, successor);
  return { cityBase, nextBase, lists, previous };
}

/**
 * Appoint a same-city governor. Keep both armies: an armed civil predecessor
 * explicitly becomes a military officer instead of entering native redistribution.
 */
export function appointSan3Governor(document: San3Document, city: number, successor: number) {
  const { cityBase, nextBase, lists, previous } = requireSan3GovernorCandidate(
    document,
    city,
    successor,
  );
  const oldBase = document.offset("officers", previous);
  const formerRoleBefore = document.read(oldBase + 12, 1);
  const formerRoleAfter =
    formerRoleBefore === 4 && document.read(oldBase + 2, 2) > 0 ? 3 : formerRoleBefore;
  const nextRole = document.read(nextBase + 12, 1);
  const advisorAfter = lists.advisor === successor ? 0xffff : lists.advisor;
  const flags = document.read(cityBase + 23, 1);
  const delegationAfter = nextRole >= 3 ? 2 : 0;
  const edit = governanceEdit(document);
  edit.serving(city, [successor, ...lists.serving.filter((index) => index !== successor)]);
  edit.write(cityBase + 10, 2, advisorAfter);
  edit.write(cityBase + 23, 1, (flags & ~3) | delegationAfter);
  edit.write(oldBase + 12, 1, formerRoleAfter);
  return {
    ...edit.finish(),
    change: {
      city,
      previous,
      successor,
      formerRoleBefore,
      formerRoleAfter,
      advisorBefore: lists.advisor,
      advisorAfter,
      delegationBefore: flags & 3,
      delegationAfter,
    },
  };
}
