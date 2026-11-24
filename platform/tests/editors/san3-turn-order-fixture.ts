import { san3Layout } from "../../src/editors/san3/document.ts";
import {
  governanceCity,
  governanceOfficer,
  san3GovernanceFixture,
} from "./san3-governance-fixture.ts";

/** Five synthetic factions; faction 1 has acted and faction 0 is taking its turn. */
export function san3TurnOrderFixture() {
  const bytes = san3GovernanceFixture();
  const data = new DataView(bytes.buffer);
  bytes[0x7878b] = 5;
  for (let faction = 2; faction <= 4; faction++) {
    const city = faction + 3;
    const officer = faction + 9;
    const base = san3Layout.factions.offset + faction * 50;
    data.setUint16(base, officer);
    data.setUint32(base + 2, governanceCity(city));
    data.setUint16(governanceCity(city) + 4, officer);
    bytes[governanceCity(city) + 20] = faction;
    bytes[governanceOfficer(officer) + 12] = 0;
    bytes[governanceOfficer(officer) + 16] = city;
    bytes[governanceOfficer(officer) + 17] = faction;
  }
  for (const [slot, faction] of [1, 0, 2, 3, 4].entries())
    data.setUint32(0x7dbb2 + slot * 4, san3Layout.factions.offset + faction * 50);
  bytes[0x7dc1f] = 1;
  data.setUint32(0x7dc22, san3Layout.factions.offset);
  data.setUint32(0x7dc2a, governanceCity(0));
  return bytes;
}
