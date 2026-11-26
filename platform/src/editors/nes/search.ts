import { MessageError, message } from "../../shared/messages.ts";
import { nesRamSize } from "./ram.ts";

export const nesFormats = ["byte", "word", "bcd"] as const;
export type NesFormat = (typeof nesFormats)[number];
export type NesComparison = "any" | "exact" | "changed" | "unchanged" | "higher" | "lower";
export interface NesScan {
  format: NesFormat;
  ram: Uint8Array;
  addresses: number[];
}

export function maxNesValue(format: NesFormat) {
  return format === "byte" ? 255 : format === "word" ? 65535 : 99;
}

export function nesValue(ram: Uint8Array, address: number, format: NesFormat): number | null {
  const low = ram[address];
  if (low === undefined) return null;
  if (format === "byte") return low;
  if (format === "word") {
    const high = ram[address + 1];
    return high === undefined ? null : low + high * 256;
  }
  const tens = low >> 4;
  const ones = low & 15;
  return tens > 9 || ones > 9 ? null : tens * 10 + ones;
}

function validValue(value: number, format: NesFormat) {
  return Number.isInteger(value) && value >= 0 && value <= maxNesValue(format);
}

/** Each refinement compares only survivors with the last explicit sample. */
export function scanNesRam(
  ram: Uint8Array,
  format: NesFormat,
  filter: NesComparison,
  exact: number,
  previous?: NesScan,
): NesScan {
  if (
    ram.length !== nesRamSize ||
    (previous && previous.format !== format) ||
    (filter === "exact" && !validValue(exact, format)) ||
    (!previous && filter !== "exact" && filter !== "any")
  )
    throw new MessageError(message("nesCheats.invalidSearch"));
  const candidates = previous?.addresses ?? Array.from({ length: nesRamSize }, (_, index) => index);
  const addresses = candidates.filter((address) => {
    const value = nesValue(ram, address, format);
    if (value === null) return false;
    if (filter === "any") return true;
    if (filter === "exact") return value === exact;
    const before = previous && nesValue(previous.ram, address, format);
    if (before == null) return false;
    switch (filter) {
      case "changed":
        return value !== before;
      case "unchanged":
        return value === before;
      case "higher":
        return value > before;
      default:
        return value < before;
    }
  });
  return { format, addresses, ram: new Uint8Array(ram) };
}

export function nesAddress(address: number) {
  return address.toString(16).toUpperCase().padStart(4, "0");
}

/** A word is two independently addressed little-endian bytes in the guest. */
export function nesValueCodes(address: number, value: number, format: NesFormat): string[] {
  if (
    !Number.isInteger(address) ||
    address < 0 ||
    address >= nesRamSize ||
    (address === nesRamSize - 1 && format === "word") ||
    !validValue(value, format)
  )
    throw new MessageError(message("nesCheats.invalidSearch"));
  const bytes =
    format === "word"
      ? [value & 255, value >> 8]
      : [format === "bcd" ? (Math.floor(value / 10) << 4) + (value % 10) : value];
  return bytes.map(
    (byte, i) => `${nesAddress(address + i)}:${byte.toString(16).toUpperCase().padStart(2, "0")}`,
  );
}
