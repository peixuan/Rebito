import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import { san3Layout } from "./document.ts";
import type { San3RelocationWrite } from "./relocation.ts";

export interface San3EquipmentAssignment {
  index: number;
  soldiers: number;
  weapon: number;
  ship: number;
}

const invalid = () => new EditorError("invalid_edit", message("san3.equipmentUnavailable"));
const weaponStocks = [0, 40, 36, 38];
const shipStocks = [0, 43, 44, 45];

/**
 * Exchange deployed equipment against its source-city inventory. The caller must
 * validate the battle graph first; this helper never creates a deployed army.
 * All refunds precede withdrawals, so same-city exchanges are order independent.
 */
export function exchangeSan3Equipment(
  original: Uint8Array,
  assignments: readonly San3EquipmentAssignment[],
) {
  if (original.length !== san3Layout.size || assignments.length > san3Layout.officers.count)
    throw invalid();
  const bytes = new Uint8Array(original);
  const data = new DataView(bytes.buffer);
  const totals = new Map<number, { width: 1 | 2; before: number; delta: number; max: number }>();
  const seen = new Set<number>();
  const reserve = (offset: number, width: 1 | 2, delta: number) => {
    const stock = totals.get(offset) ?? {
      width,
      before: width === 1 ? data.getUint8(offset) : data.getUint16(offset),
      delta: 0,
      max: width === 1 ? 100 : 9999,
    };
    if (stock.before > stock.max) throw invalid();
    stock.delta += delta;
    totals.set(offset, stock);
  };
  for (const assignment of assignments) {
    const { index, soldiers, weapon, ship } = assignment;
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= san3Layout.officers.count ||
      seen.has(index) ||
      !Number.isInteger(soldiers) ||
      soldiers < 1 ||
      soldiers > 20_000 ||
      !Number.isInteger(weapon) ||
      weapon < 0 ||
      weapon > 3 ||
      !Number.isInteger(ship) ||
      ship < 0 ||
      ship > 3
    )
      throw invalid();
    seen.add(index);
    const base = san3Layout.officers.offset + index * san3Layout.officers.stride;
    const city = data.getUint8(base + 16);
    if (city >= san3Layout.cities.count || (data.getUint8(base + 8) & 0x1c) !== 4) throw invalid();
    const cityBase = san3Layout.cities.offset + city * san3Layout.cities.stride;
    if (data.getUint8(cityBase + 20) !== data.getUint8(base + 17)) throw invalid();
    const current = data.getUint8(base + 10);
    const oldWeapon = current & 3;
    const oldShip = (current >>> 2) & 3;
    const oldSoldiers = data.getUint16(base + 2);
    if (!oldSoldiers || oldSoldiers > 20_000) throw invalid();
    if (oldWeapon)
      reserve(cityBase + (weaponStocks[oldWeapon] ?? 0), 2, Math.floor(oldSoldiers / 100));
    if (weapon) reserve(cityBase + (weaponStocks[weapon] ?? 0), 2, -Math.floor(soldiers / 100));
    if (oldShip !== ship) {
      // Native refunds at non-port destinations discard the vessel. Reject that loss here.
      if ((data.getUint8(cityBase + 21) & 0x80) === 0) throw invalid();
      if (oldShip) reserve(cityBase + (shipStocks[oldShip] ?? 0), 1, 1);
      if (ship) reserve(cityBase + (shipStocks[ship] ?? 0), 1, -1);
    }
  }
  const writes: San3RelocationWrite[] = [];
  const write = (offset: number, width: 1 | 2, after: number) => {
    const before = width === 1 ? data.getUint8(offset) : data.getUint16(offset);
    if (before === after) return;
    writes.push({ offset, width, before, after });
    if (width === 1) data.setUint8(offset, after);
    else data.setUint16(offset, after);
  };
  for (const [offset, stock] of totals) {
    const after = stock.before + stock.delta;
    if (after < 0 || after > stock.max) throw invalid();
    write(offset, stock.width, after);
  }
  for (const { index, soldiers, weapon, ship } of assignments) {
    const base = san3Layout.officers.offset + index * san3Layout.officers.stride;
    write(base + 2, 2, soldiers);
    write(base + 10, 1, (data.getUint8(base + 10) & 0xf0) | weapon | (ship << 2));
  }
  return { bytes, writes: writes.sort((left, right) => left.offset - right.offset) };
}
