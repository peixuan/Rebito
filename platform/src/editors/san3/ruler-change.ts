import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import { San3Document, san3Layout } from "./document.ts";
import { inspectSan3Lists } from "./relocation.ts";

const invalid = () => new EditorError("invalid_edit", message("san3.invalidRulerChange"));

/** A living ruler may abdicate only to an idle, unequipped officer in the capital. */
function idle(document: San3Document, index: number): boolean {
  const base = document.offset("officers", index);
  const task = document.read(base + 0x1a, 1);
  return (
    (document.read(base + 8, 1) & 0x1c) === 0 &&
    (document.read(base + 9, 1) & 0x7f) === 0 &&
    (document.read(base + 10, 1) & 0x0f) === 0 &&
    (document.read(base + 11, 1) & 0x0f) === 0 &&
    (task === 0 || task === 0xff) &&
    document.read(base + 0x1b, 1) === 0
  );
}

/**
 * Explicit editor policy, not a native death/succession command: retain the
 * capital, armies and relationships. The former ruler becomes a military officer
 * when leading troops, otherwise a civil officer, with loyalty 100.
 */
export function replaceSan3Ruler(document: San3Document, faction: number, successor: number) {
  const factionBase = document.offset("factions", faction);
  const successorBase = document.offset("officers", successor);
  const previousRuler = document.read(factionBase, 2);
  if (previousRuler === 0xffff || previousRuler === successor) throw invalid();
  const { cities, membership } = inspectSan3Lists(document);
  const capital =
    (document.read(factionBase + 2, 4) - san3Layout.cities.offset) / san3Layout.cities.stride;
  const lists = cities[capital];
  const candidate = membership.get(successor);
  const role = document.read(successorBase + 12, 1);
  if (
    !lists ||
    lists.serving[0] !== previousRuler ||
    candidate?.kind !== "serving" ||
    candidate.city !== capital ||
    role < 1 ||
    role > 4 ||
    !idle(document, previousRuler) ||
    !idle(document, successor)
  )
    throw invalid();
  const cityBase = document.offset("cities", capital);
  // Native ruler insertion clears these delegation bits; do not change unknown flags.
  if ((document.read(cityBase + 0x17, 1) & 3) !== 0) throw invalid();

  const previousBase = document.offset("officers", previousRuler);
  const formerRulerRole = document.read(previousBase + 2, 2) > 0 ? 3 : 4;
  const serving = [successor, ...lists.serving.filter((index) => index !== successor)];
  const advisor =
    lists.advisor === successor
      ? (serving.find(
          (index) =>
            index !== successor && document.read(document.offset("officers", index) + 12, 1) === 1,
        ) ?? 0xffff)
      : lists.advisor;
  const bytes = document.copy();
  const data = new DataView(bytes.buffer);
  const writes: { offset: number; width: 1 | 2; before: number; after: number }[] = [];
  const write = (offset: number, width: 1 | 2, after: number) => {
    const before = document.read(offset, width);
    if (before === after) return;
    writes.push({ offset, width, before, after });
    if (width === 1) data.setUint8(offset, after);
    else data.setUint16(offset, after);
  };
  write(factionBase, 2, successor);
  write(cityBase + 4, 2, successor);
  write(cityBase + 10, 2, advisor);
  for (const [position, index] of serving.entries())
    write(document.offset("officers", index), 2, serving[position + 1] ?? 0xffff);
  write(previousBase + 12, 1, formerRulerRole);
  write(previousBase + 15, 1, 100);
  write(successorBase + 12, 1, 0);
  write(successorBase + 15, 1, 0);
  inspectSan3Lists(new San3Document(bytes));
  writes.sort((left, right) => left.offset - right.offset);
  return {
    bytes,
    writes,
    change: {
      faction,
      capital,
      previousRuler,
      successor,
      formerRulerRole,
      formerRulerLoyalty: 100,
    },
  };
}
