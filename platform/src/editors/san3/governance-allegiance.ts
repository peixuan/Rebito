import type { San3Document } from "./document.ts";
import type { governanceEdit } from "./governance-core.ts";

/** Explicit surrender policy: full loyalty and fresh service, without random rolls. */
export function adoptSan3Officers(
  document: San3Document,
  edit: ReturnType<typeof governanceEdit>,
  officers: readonly number[],
  faction: number,
) {
  return officers.map((index) => {
    const base = document.offset("officers", index);
    const before = {
      faction: document.read(base + 17, 1),
      loyalty: document.read(base + 15, 1),
      service: document.read(base + 18, 1),
      originFaction: document.read(base + 19, 1),
      originService: document.read(base + 20, 1),
    };
    edit.write(base + 15, 1, 100);
    edit.write(base + 17, 1, faction);
    edit.write(base + 18, 1, 1);
    edit.write(base + 19, 1, 255);
    edit.write(base + 20, 1, 0);
    return {
      index,
      before,
      after: { faction, loyalty: 100, service: 1, originFaction: 255, originService: 0 },
    };
  });
}
