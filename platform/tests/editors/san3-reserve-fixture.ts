import { san3Layout } from "../../src/editors/san3/document.ts";
import { san3BattleFixture } from "./san3-battle-fixture.ts";

const officer = (index: number) => san3Layout.officers.offset + index * 30;
const city = san3Layout.cities.offset + san3Layout.cities.stride;
export function san3ReserveFixture() {
  const bytes = san3BattleFixture();
  const data = new DataView(bytes.buffer);
  data.setUint32(0x4ab2c, city);
  data.setUint16(city + 4, 3);
  for (const index of [3, 4]) {
    const base = officer(index);
    bytes.fill(0, base, base + 30);
    data.setUint16(base, index === 3 ? 4 : 0xffff);
    data.setUint16(base + 2, 1500);
    bytes[base + 8] = 0x81;
    bytes[base + 10] = 0x70;
    bytes[base + 12] = 3;
    bytes[base + 16] = 1;
    bytes[base + 17] = 1;
    bytes[base + 21] = 75;
    bytes[base + 22] = 40;
    const name = san3Layout.historical.offset + index * 30 + 15;
    bytes.fill(0, name, name + 7);
    bytes[name] = 65 + index;
  }
  return bytes;
}
