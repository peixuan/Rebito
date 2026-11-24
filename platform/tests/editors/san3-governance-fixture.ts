import { san3Layout } from "../../src/editors/san3/document.ts";

export const governanceCity = (index: number) => san3Layout.cities.offset + index * 52;
export const governanceOfficer = (index: number) => san3Layout.officers.offset + index * 30;

/** Two factions, three owned cities in the first, and independent neutral lists. */
export function san3GovernanceFixture() {
  const bytes = new Uint8Array(san3Layout.size);
  const data = new DataView(bytes.buffer);
  data.setUint32(0x78000, 0x4b4f4549);
  data.setUint32(0x78776, 0x4b4f4549);
  data.setUint16(0x78788, 200);
  for (let index = 0; index < 21; index++)
    data.setUint16(san3Layout.factions.offset + index * 50, 0xffff);
  for (const [faction, ruler, capital] of [
    [0, 0, 0],
    [1, 6, 3],
  ] as const) {
    data.setUint16(san3Layout.factions.offset + faction * 50, ruler);
    data.setUint32(san3Layout.factions.offset + faction * 50 + 2, governanceCity(capital));
  }
  for (let index = 0; index < 46; index++) {
    const base = governanceCity(index);
    for (const relative of [4, 6, 8, 10]) data.setUint16(base + relative, 0xffff);
    bytes[base + 20] = index < 3 ? 0 : index === 3 ? 1 : 255;
    bytes[base + 23] = 0xa5;
  }
  data.setUint32(governanceCity(0), governanceCity(1));
  data.setUint32(governanceCity(1), governanceCity(2));
  const lists = [[0, 1, 2], [3, 4, 5], [8], [6, 7]];
  for (const [city, officers] of lists.entries()) {
    data.setUint16(governanceCity(city) + 4, officers[0] as number);
    for (const [position, index] of officers.entries())
      data.setUint16(governanceOfficer(index), officers[position + 1] ?? 0xffff);
  }
  data.setUint16(governanceCity(0) + 10, 2);
  data.setUint16(governanceCity(1) + 10, 4);
  data.setUint16(governanceCity(4) + 6, 9);
  data.setUint16(governanceCity(4) + 8, 10);
  for (let index = 0; index < 600; index++) {
    const base = governanceOfficer(index);
    if (index >= 9) data.setUint16(base, 0xffff);
    data.setUint16(base + 2, index <= 8 ? 3000 : 0);
    bytes[base + 8] = 0x80;
    bytes[base + 9] = 0x80;
    bytes[base + 10] = 0x70;
    bytes[base + 11] = 0xe0;
    bytes[base + 12] = [0, 2, 1, 4, 1, 3, 0, 3, 2, 5, 6][index] ?? 7;
    bytes[base + 15] = index === 0 || index === 6 ? 0 : 75;
    bytes[base + 16] =
      index < 3 ? 0 : index < 6 ? 1 : index < 8 ? 3 : index === 8 ? 2 : index < 11 ? 4 : 255;
    bytes[base + 17] = index < 6 || index === 8 ? 0 : index < 8 ? 1 : 255;
    bytes[base + 19] = 255;
    bytes[base + 21] = 67;
    bytes[base + 22] = 78;
  }
  bytes[123] = 219;
  return bytes;
}
