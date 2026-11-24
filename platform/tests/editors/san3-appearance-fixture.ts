import { san3Layout } from "../../src/editors/san3/document.ts";
import { san3GlyphLayout } from "../../src/editors/san3/names.ts";
import { san3TreasureLayout } from "../../src/editors/san3/treasures.ts";
import {
  governanceCity as city,
  governanceOfficer as officer,
  san3GovernanceFixture,
} from "./san3-governance-fixture.ts";
import { san3NameFixture } from "./san3-name-fixture.ts";

const custom = (slot: number) => san3Layout.custom.offset + slot * 28;

/** Two ordinary registered custom definitions, one advisor and one pending introduction. */
export function san3AppearanceFixture() {
  const bytes = san3GovernanceFixture();
  const data = new DataView(bytes.buffer);
  const alphabet = san3NameFixture();
  bytes.set(
    alphabet.subarray(san3GlyphLayout.offset, san3GlyphLayout.offset + san3GlyphLayout.count * 2),
    san3GlyphLayout.offset,
  );
  for (let index = 0; index < 311; index++) data.setUint16(0x478f0 + index * 2, 0x8000 + index);
  data.setUint16(0x78788, 189);
  bytes[0x7dc2e] = 1;
  bytes[0x7dc28] = 0xa5;
  data.setUint16(0x478ca, 188);
  for (let slot = 0; slot < 68; slot++) data.setUint16(custom(slot), 65535);
  for (const slot of [8, 9]) {
    data.setUint16(custom(slot), 231);
    bytes.set([2, 0, 60, 60, 60, 60, 60, 60, 1, 31, 20], custom(slot) + 2);
  }
  for (let index = 1; index < 13; index++)
    data.setUint16(san3TreasureLayout.owners + index * 2, 65535);
  bytes.copyWithin(officer(540), officer(2), officer(2) + 30);
  data.setUint16(officer(1), 540);
  data.setUint16(officer(540), 2);
  data.setUint16(city(0) + 10, 540);
  bytes[officer(541) + 12] = 255;
  bytes[officer(541) + 21] = 0;
  bytes[officer(541) + 22] = 0;
  return bytes;
}
