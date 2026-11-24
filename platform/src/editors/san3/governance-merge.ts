import { type San3Document, san3Layout } from "./document.ts";
import { adoptSan3Officers } from "./governance-allegiance.ts";
import {
  governanceEdit,
  inspectSan3Governance,
  invalidGovernance,
  requireIdleGovernor,
} from "./governance-core.ts";

/**
 * Absorb an idle faction, including its final city, without moving its armies.
 * The current command's faction cannot be dissolved: native code also keeps its
 * identity on the CPU stack. Absorb the other side, then appoint its former ruler
 * if that ruler should lead the combined territory instead.
 */
export function mergeSan3Factions(document: San3Document, source: number, target: number) {
  const sourceBase = document.offset("factions", source);
  document.offset("factions", target);
  const graph = inspectSan3Governance(document);
  const sourceCities = graph.factionCities[source] ?? [];
  const targetCities = graph.factionCities[target] ?? [];
  const active = graph.factionCities.filter((cities) => cities.length).length;
  const sourceControl = document.read(0x7dc0a + source, 1);
  const targetControl = document.read(0x7dc0a + target, 1);
  if (
    source === target ||
    !sourceCities.length ||
    !targetCities.length ||
    document.read(0x7dc22, 4) === sourceBase ||
    document.read(0x7878b, 1) !== active ||
    sourceControl > 1 ||
    targetControl > 1 ||
    document.read(sourceBase + 42, 1) !== 255
  )
    throw invalidGovernance();
  const officers = sourceCities.flatMap((city) => graph.cities[city]?.serving ?? []);
  for (const index of officers) requireIdleGovernor(document, index);
  for (const city of sourceCities) {
    const base = document.offset("cities", city);
    if ((document.read(base + 22, 1) & 0x41) !== 0 || document.read(0x7dc2a, 4) === base)
      throw invalidGovernance();
  }
  const cleanup: { index: number; rebellion: number; turncoat: number; infiltration: number }[] =
    [];
  for (let index = 0; index < san3Layout.officers.count; index++) {
    const base = document.offset("officers", index);
    if (
      document.read(base + 17, 1) === target &&
      (document.read(base + 9, 1) & 64) !== 0 &&
      document.read(base + 26, 1) === 7 &&
      sourceCities.includes(document.read(base + 28, 1))
    )
      throw invalidGovernance();
    if (
      officers.includes(index) ||
      (document.read(base + 8, 1) & 16) !== 0 ||
      document.read(base + 19, 1) !== source
    )
      continue;
    if ((document.read(base + 8, 1) & 4) !== 0) throw invalidGovernance();
    cleanup.push({
      index,
      rebellion: (document.read(base + 8, 1) >> 3) & 1,
      turncoat: (document.read(base + 9, 1) >> 4) & 3,
      infiltration: document.read(base + 11, 1) & 31,
    });
  }
  const edit = governanceEdit(document);
  edit.cities(target, [...targetCities, ...sourceCities]);
  edit.cities(source, []);
  for (const city of sourceCities) edit.write(document.offset("cities", city) + 20, 1, target);
  const allegiances = adoptSan3Officers(document, edit, officers, target);
  const formerRuler = document.faction(source).ruler;
  const rulerBase = document.offset("officers", formerRuler);
  const formerRulerRole = document.read(rulerBase + 2, 2) ? 3 : 4;
  edit.write(rulerBase + 12, 1, formerRulerRole);
  const oldCapital = document.offset("cities", sourceCities[0] as number);
  edit.write(oldCapital + 23, 1, (document.read(oldCapital + 23, 1) & ~3) | 2);
  edit.write(sourceBase, 2, 65535);
  edit.write(0x7878b, 1, active - 1);
  edit.write(0x7dc0a + source, 1, 0);
  edit.write(0x7dc0a + target, 1, sourceControl | targetControl);
  // Native extinction clears the covert sponsor. Also cancel the associated
  // rebellion/turncoat intents explicitly, without clearing unrelated equipment/tasks.
  for (const { index } of cleanup) {
    const base = document.offset("officers", index);
    edit.write(base + 8, 1, document.read(base + 8, 1) & ~8);
    edit.write(base + 9, 1, document.read(base + 9, 1) & ~0x30);
    edit.write(base + 11, 1, document.read(base + 11, 1) & 0xe0);
    edit.write(base + 19, 1, 255);
    edit.write(base + 20, 1, 0);
  }
  const diplomacy: {
    faction: number;
    alliance: boolean;
    joint: boolean;
    targetReference: boolean;
  }[] = [];
  for (let faction = 0; faction < san3Layout.factions.count; faction++) {
    const base = document.offset("factions", faction);
    const mask = document.read(base + 6, 4);
    const alliance = (mask & (faction === source ? 0x1fffff : 1 << source)) !== 0;
    const partner = document.read(base + 36, 1);
    const joint =
      partner !== 255 &&
      (faction === source ||
        partner === source ||
        sourceCities.includes(document.read(base + 37, 1)));
    const targetReference = document.read(base + 14, 1) === source;
    // +36 is the native agreement-validity sentinel. Reward/unknown bytes survive.
    if (joint) edit.write(base + 36, 1, 255);
    if (targetReference) edit.write(base + 14, 1, 255);
    if (faction === source) edit.write(base + 6, 4, (mask & ~0x1fffff) >>> 0);
    else if (alliance) edit.write(base + 6, 4, (mask & ~(1 << source)) >>> 0);
    if (joint || targetReference || alliance)
      diplomacy.push({ faction, alliance, joint, targetReference });
  }
  // Preserve the in-progress turn queue and its index. The native iterator skips
  // inactive ruler=FFFF entries; removing queue slots could skip a living faction.
  return {
    ...edit.finish(),
    change: {
      source,
      target,
      cities: sourceCities,
      formerRuler,
      formerRulerRole,
      controlBefore: targetControl,
      controlAfter: sourceControl | targetControl,
      allegiances,
      cleanup,
      diplomacy,
    },
  };
}
