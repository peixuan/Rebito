import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import { san3Layout } from "./document.ts";
import { decodeSan3Name } from "./names.ts";
import type { San3RelocationWrite } from "./relocation.ts";

const invalid = () => new EditorError("invalid_save", message("editor.invalidSave"));
const invalidEdit = () => new EditorError("invalid_edit", message("editor.invalidEdit"));
const officerOffset = (index: number) => san3Layout.officers.offset + index * 30;

export interface San3BattleReserve {
  index: number;
  name: string;
  city: number;
  soldiers: number;
  deploymentUsed: number;
}

/** Native retreat retains the deployment bit, but removes the unit from the map. */
function withdrawn(bytes: Uint8Array, data: DataView, base: number) {
  return (
    (data.getUint8(base + 8) & 0x1c) === 4 &&
    data.getUint8(base + 12) <= 4 &&
    (data.getUint8(base + 9) & 0x7f) === 0 &&
    (data.getUint8(base + 10) & 15) === 0 &&
    bytes[base + 23] === 0 &&
    data.getUint16(base + 24) === 0xffff &&
    bytes[base + 26] === 255 &&
    data.getUint16(base + 28) === 0xffff
  );
}

/** The caller verifies the HEX schema; this verifies the separate city-reserve graph. */
export function inspectSan3BattleReserves(bytes: Uint8Array, deployed: ReadonlySet<number>) {
  if (bytes.length !== san3Layout.size) throw invalid();
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cityPointer = data.getUint32(0x4ab2c);
  const defenseCity = (cityPointer - san3Layout.cities.offset) / san3Layout.cities.stride;
  const cityBattle = cityPointer !== 0 && data.getUint16(0x52056) === 0;
  if (
    cityPointer !== 0 &&
    (!cityBattle || !Number.isInteger(defenseCity) || defenseCity < 0 || defenseCity >= 46)
  )
    throw invalid();
  const seen = new Set(deployed);
  const battleFactions = new Set([...deployed].map((index) => bytes[officerOffset(index) + 17]));
  const retired = new Set<number>();
  const reserves: San3BattleReserve[] = [];
  for (let city = 0; city < san3Layout.cities.count; city++) {
    const cityBase = san3Layout.cities.offset + city * san3Layout.cities.stride;
    const faction = data.getUint8(cityBase + 20);
    let index = data.getUint16(cityBase + 4);
    if (cityBattle && city === defenseCity) {
      if (
        faction >= san3Layout.factions.count ||
        data.getUint32(0x4b504) !==
          san3Layout.factions.offset + faction * san3Layout.factions.stride
      )
        throw invalid();
    }
    while (index !== 0xffff) {
      if (index >= san3Layout.officers.count || seen.has(index)) throw invalid();
      seen.add(index);
      const base = officerOffset(index);
      if (
        faction >= san3Layout.factions.count ||
        bytes[base + 16] !== city ||
        bytes[base + 17] !== faction
      )
        throw invalid();
      const used = (data.getUint8(base + 8) & 4) !== 0;
      if (used) {
        if (!battleFactions.has(faction) || !withdrawn(bytes, data, base)) throw invalid();
        retired.add(index);
      }
      const task = bytes[base + 26];
      const soldiers = data.getUint16(base + 2);
      const role = data.getUint8(base + 12);
      if (
        cityBattle &&
        city === defenseCity &&
        role >= 1 &&
        role <= 3 &&
        soldiers >= 1 &&
        soldiers <= 20_000 &&
        data.getUint8(base + 21) <= 100 &&
        data.getUint8(base + 22) <= 120 &&
        (data.getUint8(base + 8) & 0x18) === 0 &&
        (data.getUint8(base + 9) & 0x7f) === 0 &&
        (data.getUint8(base + 10) & 15) === 0 &&
        (task === 0 || task === 255) &&
        (used || bytes[base + 27] === 0 || data.getUint16(base + 28) === 0xffff)
      ) {
        const names =
          index < san3Layout.historical.count
            ? san3Layout.historical.offset + index * 30 + 15
            : san3Layout.custom.offset + (index - san3Layout.historical.count) * 28 + 13;
        reserves.push({
          index,
          city,
          name: decodeSan3Name(bytes.subarray(names, names + 7)),
          soldiers,
          deploymentUsed: Number(used),
        });
      }
      index = data.getUint16(base);
    }
  }
  return { retired, reserves };
}

/** Changes deployment eligibility only; native commands own map entry and withdrawal. */
export function editSan3ReserveDeployment(
  original: Uint8Array,
  deployed: ReadonlySet<number>,
  changes: Record<string, number>,
) {
  const { reserves } = inspectSan3BattleReserves(original, deployed);
  const entries = Object.entries(changes).map(([key, value]) => {
    const match = /^reserve\.(0|[1-9]\d{0,2})\.deploymentUsed$/.exec(key);
    const reserve = match && reserves.find(({ index }) => index === Number(match[1]));
    if (!reserve || (value !== 0 && value !== 1)) throw invalidEdit();
    return { key, reserve, value };
  });
  const bytes = new Uint8Array(original);
  const data = new DataView(bytes.buffer);
  const writes: San3RelocationWrite[] = [];
  const write = (offset: number, width: 1 | 2, after: number) => {
    const before = width === 1 ? data.getUint8(offset) : data.getUint16(offset);
    if (before === after) return;
    writes.push({ offset, width, before, after });
    if (width === 1) data.setUint8(offset, after);
    else data.setUint16(offset, after);
  };
  for (const { reserve, value } of entries) {
    if (reserve.deploymentUsed === value) continue;
    const base = officerOffset(reserve.index);
    write(base + 8, 1, (data.getUint8(base + 8) & ~4) | (value << 2));
    if (value) {
      // Native 0x296d2 retirement markers; intelligence and unrelated flags survive.
      write(base + 23, 1, 0);
      write(base + 24, 2, 0xffff);
      write(base + 26, 1, 255);
      write(base + 28, 2, 0xffff);
    }
  }
  inspectSan3BattleReserves(bytes, deployed);
  return { bytes, writes, entries };
}
