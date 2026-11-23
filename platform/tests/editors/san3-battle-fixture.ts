import { san3Layout } from "../../src/editors/san3/document.ts";

/** Generated graph and isolated instruction markers; no game image or captured memory. */
export function san3BattleFixture() {
  const bytes = new Uint8Array(san3Layout.size).fill(0x52);
  const data = new DataView(bytes.buffer);
  data.setUint32(0x78000, 0x4b4f4549);
  data.setUint32(0x78776, 0x4b4f4549);
  data.setUint16(0x78788, 189);
  bytes[0x7878a] = 0;
  data.setUint16(0x4abc4, 1);
  data.setUint16(0x52056, 0);
  data.setUint16(0x52058, 0);
  data.setUint32(0x54000, 0x4eba0c94);
  data.setUint32(0x27ba4, 0x10280017);
  data.setUint32(0x27bc4, 0x11420017);
  data.setUint16(0x6532c, 0x4eb9);
  data.setUint32(0x6532e, 0x27b92);
  data.setUint16(0x65614, 0x4eb9);
  data.setUint32(0x65616, 0x27bac);
  for (let slot = 0; slot < 8; slot++) data.setUint16(0x4b504 + slot * 12 + 6, 0xffff);
  for (const [slot, faction, head] of [
    [0, 1, 1],
    [4, 0, 0],
  ] as const) {
    const factionBase = san3Layout.factions.offset + faction * san3Layout.factions.stride;
    const city = san3Layout.cities.offset + faction * san3Layout.cities.stride;
    data.setUint32(0x4b504 + slot * 12, factionBase);
    data.setUint16(0x4b504 + slot * 12 + 6, head);
    data.setUint16(factionBase, head);
    data.setUint32(factionBase + 2, city);
    bytes[city + 20] = faction;
  }
  for (let index = 0; index < 3; index++) {
    const base = san3Layout.officers.offset + index * san3Layout.officers.stride;
    data.setUint16(base, index === 1 ? 2 : 0xffff);
    data.setUint16(base + 2, 2000);
    bytes[base + 8] = 5;
    bytes[base + 12] = 1;
    bytes[base + 16] = index === 0 ? 0 : 1;
    bytes[base + 17] = index === 0 ? 0 : 1;
    bytes[base + 21] = 60;
    bytes[base + 22] = 70;
    bytes[base + 23] = 5 + index;
    const name = san3Layout.historical.offset + index * san3Layout.historical.stride + 15;
    bytes.fill(0, name, name + 7);
    bytes[name] = 65 + index;
  }
  return bytes;
}
