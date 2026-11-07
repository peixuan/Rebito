import { layout } from "../../src/editors/koukai2/document.ts";

/** Synthetic container with deliberately nonzero unknown bytes. No game data. */
export function editorFixture(hero = 0, slot = 0): Uint8Array {
  const bytes = new Uint8Array(layout.size).fill(0xa5);
  bytes.fill(0, 0, layout.header);
  bytes.set(new TextEncoder().encode("11/ 11/1522"), 1 + slot * 15);
  bytes[layout.header + slot * layout.slot + 0x611] = hero;
  return bytes;
}
