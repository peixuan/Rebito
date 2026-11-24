import { San3Document, san3Layout } from "./document.ts";
import { type governanceEdit, invalidGovernance, requireIdleGovernor } from "./governance-core.ts";
import { createSan3NameCodec, decodeSan3Name } from "./names.ts";

/** Reject unused custom slots and definitions that cannot be rendered safely. */
export function requireSan3Definition(document: San3Document, index: number) {
  document.offset("officers", index);
  const custom = index >= san3Layout.historical.count;
  const definition = custom
    ? san3Layout.custom.offset + (index - san3Layout.historical.count) * 28
    : san3Layout.historical.offset + index * 30;
  const portrait = document.read(definition, 2);
  const knownPortrait =
    (portrait >= 1 && portrait <= 307) ||
    (portrait >= 0x8000 &&
      portrait < 65535 &&
      Array.from({ length: 311 }, (_, entry) => document.read(0x478f0 + entry * 2, 2)).includes(
        portrait,
      ));
  if (!knownPortrait || Object.values(document.attributes(index)).some((value) => value > 100))
    throw invalidGovernance();
  if (custom) {
    const month = document.read(definition + 10, 1);
    const day = document.read(definition + 11, 1);
    const age = document.read(definition + 12, 1);
    const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
    if (day < 1 || day > days || age < 1 || age > 99 || document.read(definition + 3, 1) > 1)
      throw invalidGovernance();
  }
}

/** Native pending and unused custom records have no roster and may retain zero placeholders. */
export function requireUnplacedSan3Custom(document: San3Document, index: number) {
  const base = document.offset("officers", index);
  requireIdleGovernor(document, index);
  if (
    index < san3Layout.historical.count ||
    document.read(base + 12, 1) !== 255 ||
    ![0, 65535].includes(document.read(base, 2)) ||
    ![0, 255].includes(document.read(base + 16, 1)) ||
    ![0, 255].includes(document.read(base + 17, 1)) ||
    document.read(base + 2, 2) !== 0 ||
    document.read(base + 21, 1) !== 0 ||
    document.read(base + 22, 1) !== 0 ||
    (document.read(base + 10, 1) & 15) !== 0
  )
    throw invalidGovernance();
}

/** Register a filled unused definition with an original default portrait; never invent names. */
export function san3RegistrationPortrait(document: San3Document, index: number) {
  if (index < san3Layout.historical.count) return undefined;
  const slot = index - san3Layout.historical.count;
  const offset = san3Layout.custom.offset + slot * san3Layout.custom.stride;
  if (document.read(offset, 2) !== 65535) return undefined;
  requireUnplacedSan3Custom(document, index);
  const bytes = document.copy();
  const codec = createSan3NameCodec(bytes);
  for (const [kind, relative, length] of [
    ["kanji", 13, 7],
    ["kana", 20, 8],
  ] as const) {
    const text = decodeSan3Name(bytes.subarray(offset + relative, offset + relative + length));
    if (!text.trim()) throw invalidGovernance();
    codec.encode(kind, text);
  }
  if (Object.values(document.attributes(index)).some((value) => value < 1))
    throw invalidGovernance();
  const gender = document.read(offset + 3, 1);
  const portrait = slot < 8 ? (gender === 0 ? 231 : 239) : gender === 0 ? 247 : 277;
  new DataView(bytes.buffer).setUint16(offset, portrait);
  requireSan3Definition(new San3Document(bytes), index);
  return { offset, portrait };
}

/** Caller has detached the officer and validated the destination list. */
export function placeSan3Unaffiliated(
  document: San3Document,
  edit: ReturnType<typeof governanceEdit>,
  index: number,
  city: number,
  role: 5 | 6,
  head: number,
) {
  const base = document.offset("officers", index);
  edit.write(document.offset("cities", city) + (role === 5 ? 6 : 8), 2, index);
  edit.write(base, 2, head);
  resetSan3OfficerPlacement(document, edit, index, city, role, 255);
}

/** A fresh placement keeps the definition and belongings, not a former army or mission. */
export function resetSan3OfficerPlacement(
  document: San3Document,
  edit: ReturnType<typeof governanceEdit>,
  index: number,
  city: number,
  role: 4 | 5 | 6,
  faction: number,
) {
  const base = document.offset("officers", index);
  edit.write(base + 2, 2, 0);
  edit.write(base + 8, 1, document.read(base + 8, 1) & ~0x1d);
  edit.write(base + 9, 1, document.read(base + 9, 1) & 0x80);
  edit.write(base + 10, 1, document.read(base + 10, 1) & 0xf0);
  edit.write(base + 11, 1, document.read(base + 11, 1) & 0xe0);
  edit.write(base + 12, 1, role);
  edit.write(base + 15, 1, faction === 255 ? 0 : 100);
  edit.write(base + 16, 1, city);
  edit.write(base + 17, 1, faction);
  edit.write(base + 18, 1, faction === 255 ? 0 : 1);
  edit.write(base + 19, 1, 255);
  edit.write(base + 20, 1, 0);
  edit.write(base + 21, 1, 0);
  edit.write(base + 22, 1, 0);
  edit.write(base + 26, 1, 0);
  edit.write(base + 27, 1, 0);
  edit.write(base + 28, 2, 0);
}
