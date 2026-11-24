import { type San3Document, san3Layout } from "./document.ts";
import { type governanceEdit, invalidGovernance } from "./governance-core.ts";

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
  edit.write(base + 2, 2, 0);
  edit.write(base + 8, 1, document.read(base + 8, 1) & ~0x1d);
  edit.write(base + 9, 1, document.read(base + 9, 1) & 0x80);
  edit.write(base + 10, 1, document.read(base + 10, 1) & 0xf0);
  edit.write(base + 11, 1, document.read(base + 11, 1) & 0xe0);
  edit.write(base + 12, 1, role);
  edit.write(base + 15, 1, 0);
  edit.write(base + 16, 1, city);
  edit.write(base + 17, 1, 255);
  edit.write(base + 18, 1, 0);
  edit.write(base + 19, 1, 255);
  edit.write(base + 20, 1, 0);
  edit.write(base + 21, 1, 0);
  edit.write(base + 22, 1, 0);
  edit.write(base + 26, 1, 0);
  edit.write(base + 27, 1, 0);
  edit.write(base + 28, 2, 0);
}
