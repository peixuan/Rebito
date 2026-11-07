import { type DisplayText, MessageError, message, textIdentity } from "../../shared/messages.ts";
/** Internal binary descriptors never come from an HTTP request. */
export interface Field {
  key: string;
  label: DisplayText;
  group: DisplayText;
  offset: number;
  size: 1 | 2 | 4;
  min: number;
  max: number;
  bias?: number;
  mask?: number;
  shift?: number;
  writeOr?: number;
  preserveBits?: boolean;
  choices?: { value: number; label: DisplayText }[];
  boolean?: boolean;
  hidden?: boolean;
  readonly?: boolean;
  multiplier?: number;
  divisor?: number;
  help?: DisplayText;
}
export interface Action {
  id: string;
  label: DisplayText;
  help?: DisplayText;
}
export interface EditorRecord {
  id: string;
  label: DisplayText;
  summary?: DisplayText;
  fields: Field[];
  actions?: Action[];
  available?: boolean;
  tags?: string[];
}
export interface Context {
  bytes: Uint8Array;
  base: number;
  hero: number;
}
export type Changes = Record<string, number>;

export function numberField(
  key: string,
  label: DisplayText,
  group: DisplayText,
  offset: number,
  size: Field["size"],
  max = 2 ** (size * 8) - 1,
  options: Partial<Field> = {},
): Field {
  return { key, label, group, offset, size, min: 0, max, ...options };
}
export function choices(labels: readonly DisplayText[]) {
  return labels.map((label, value) => ({ value, label }));
}
export function columnId(field: Pick<Field, "group" | "label">): string {
  return `${textIdentity(field.group)}/${textIdentity(field.label)}`;
}
function view(bytes: Uint8Array, field: Field) {
  if (
    !Number.isInteger(field.offset) ||
    field.offset < 0 ||
    field.offset + field.size > bytes.length
  )
    throw new MessageError(message("koukai2.fieldBounds"));
  return new DataView(bytes.buffer, bytes.byteOffset + field.offset, field.size);
}
function rawValue(bytes: Uint8Array, field: Field): number {
  const data = view(bytes, field);
  return field.size === 1
    ? data.getUint8(0)
    : field.size === 2
      ? data.getUint16(0, true)
      : data.getUint32(0, true);
}
export function readField(bytes: Uint8Array, field: Field): number {
  let raw = rawValue(bytes, field);
  if (field.mask) raw = (raw & field.mask) >>> (field.shift ?? 0);
  return raw - (field.bias ?? 0);
}
export function validateValue(field: Field, value: number): void {
  if (
    field.readonly ||
    !Number.isSafeInteger(value) ||
    value < field.min ||
    value > field.max ||
    (field.choices && !field.choices.some((choice) => choice.value === value))
  )
    throw new MessageError(message("koukai2.invalidValue", { field: field.label }));
}
export function writeField(bytes: Uint8Array, field: Field, value: number): void {
  validateValue(field, value);
  let raw = value + (field.bias ?? 0);
  if (field.mask) {
    raw =
      ((raw << (field.shift ?? 0)) & field.mask) |
      (field.preserveBits === false ? 0 : rawValue(bytes, field) & ~field.mask);
  }
  raw = (raw | (field.writeOr ?? 0)) >>> 0;
  const data = view(bytes, field);
  if (field.size === 1) data.setUint8(0, raw);
  else if (field.size === 2) data.setUint16(0, raw, true);
  else data.setUint32(0, raw, true);
}
