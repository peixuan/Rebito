import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import { San3Document } from "./document.ts";
import { inspectSan3Lists, type San3RelocationWrite } from "./relocation.ts";

const invalid = () => new EditorError("invalid_edit", message("san3.invalidAppointment"));

/** Native qualification checks use base abilities, without treasure bonuses. */
function qualifies(document: San3Document, index: number, role: number): boolean {
  const { land, naval, strength, intelligence, politics, charisma } = document.attributes(index);
  if ([land, naval, strength, intelligence, politics, charisma].some((value) => value > 100))
    return false;
  if (role === 1) return intelligence >= 80 || politics >= 80;
  if (role === 2)
    return strength >= 85 || (strength >= 70 && charisma + Math.floor((land + naval) / 2) >= 120);
  return true;
}

function eligibility(document: San3Document, index: number) {
  const base = document.offset("officers", index);
  const graph = inspectSan3Lists(document);
  const member = graph.membership.get(index);
  const city = member ? graph.cities[member.city] : undefined;
  const currentRole = document.read(base + 12, 1);
  const task = document.read(base + 26, 1);
  const eligible =
    member?.kind === "serving" &&
    city !== undefined &&
    city.serving[0] !== index &&
    currentRole >= 1 &&
    currentRole <= 4 &&
    !graph.rulers.has(index) &&
    (document.read(base + 8, 1) & 0x1c) === 0 &&
    (document.read(base + 9, 1) & 0x7f) === 0 &&
    (document.read(base + 11, 1) & 0x1f) === 0 &&
    (task === 0 || task === 0xff) &&
    document.read(base + 27, 1) === 0;
  return { base, city, member, currentRole, eligible };
}

/** Choices omit transitions requiring native combat, task or army redistribution. */
export function san3AppointmentOptions(document: San3Document, index: number) {
  const { base, city, currentRole, eligible } = eligibility(document, index);
  const roles = eligible
    ? [1, 2, 3, 4].filter(
        (role) =>
          (role === currentRole || qualifies(document, index, role)) &&
          (role !== 4 ||
            (document.read(base + 2, 2) === 0 && (document.read(base + 10, 1) & 15) === 0)),
      )
    : [];
  return { roles, canAdvise: roles.includes(1) && city?.advisor !== index };
}

/**
 * Appoint a serving officer without moving them. Preserve loyalty and armies:
 * native random loyalty responses and troop redistribution are not simulated.
 * A new strategist fills an empty advisor seat; replacing its holder is explicit.
 */
export function appointSan3Officer(
  document: San3Document,
  index: number,
  role: number,
  makeAdvisor = false,
) {
  if (!Number.isInteger(role) || role < 1 || role > 4 || typeof makeAdvisor !== "boolean")
    throw invalid();
  const { base, city, member, currentRole, eligible } = eligibility(document, index);
  if (
    !eligible ||
    !city ||
    !member ||
    (makeAdvisor && role !== 1) ||
    (role !== currentRole && !qualifies(document, index, role)) ||
    (role === 4 && (document.read(base + 2, 2) !== 0 || (document.read(base + 10, 1) & 15) !== 0))
  )
    throw invalid();
  const advisor =
    role === 1 && (makeAdvisor || city.advisor === 0xffff)
      ? index
      : role !== 1 && city.advisor === index
        ? 0xffff
        : city.advisor;
  if (role === currentRole && advisor === city.advisor) throw invalid();
  const bytes = document.copy();
  const data = new DataView(bytes.buffer);
  const writes: San3RelocationWrite[] = [];
  const write = (offset: number, width: 1 | 2, after: number) => {
    const before = document.read(offset, width);
    if (before === after) return;
    writes.push({ offset, width, before, after });
    if (width === 1) data.setUint8(offset, after);
    else data.setUint16(offset, after);
  };
  write(base + 12, 1, role);
  write(document.offset("cities", member.city) + 10, 2, advisor);
  inspectSan3Lists(new San3Document(bytes));
  writes.sort((left, right) => left.offset - right.offset);
  return {
    bytes,
    writes,
    change: {
      index,
      city: member.city,
      before: currentRole,
      after: role,
      advisorBefore: city.advisor,
      advisorAfter: advisor,
    },
  };
}
