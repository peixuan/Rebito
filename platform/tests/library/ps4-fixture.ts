import { phantasyStar4Fixture } from "../editors/phantasy-star4-fixture.ts";
import { phantasyStar4RulesFixture } from "../editors/phantasy-star4-rules-fixture.ts";
import { mdFixture } from "./sega-fixtures.ts";

/** Original test ROM that initializes synthetic editor records, then runs our VDP fixture. */
export function ps4FixtureRom(): Uint8Array {
  const bytes = phantasyStar4RulesFixture(mdFixture());
  bytes.set(phantasyStar4Fixture(), 0x8000);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 0x400);
  view.setUint32(0x1a4, bytes.length - 1);
  const words = [
    0x46fc,
    0x2700, // Disable interrupts during initialization.
    0x207c,
    0x0000,
    0x8000, // Source A0: original fixture data.
    0x227c,
    0x00ff,
    0x0000, // Destination A1: work RAM.
    0x303c,
    0x3fff, // Copy 16384 longwords.
    0x22d8, // MOVE.L (A0)+,(A1)+.
    0x51c8,
    0xfffc, // DBF D0, copy loop.
    0x13fc,
    0x0001,
    0x00a1,
    0x30f1, // Enable SRAM when the generated metadata ROM extends past 2 MiB.
    0x4ef9,
    0x0000,
    0x0200, // Start the original display/input fixture.
  ];
  words.forEach((word, index) => {
    view.setUint16(0x400 + index * 2, word);
  });
  let checksum = 0;
  for (let offset = 0x200; offset < bytes.length; offset += 2) checksum += view.getUint16(offset);
  view.setUint16(0x18e, checksum & 0xffff);
  return bytes;
}
