import { zipSync } from "fflate";
import { mdFixture } from "./sega-fixtures.ts";

/** Original firmware program and synthetic disc; no vendor BIOS or game bytes. */
export function discBios(region = "J") {
  const bios = Buffer.alloc(131072);
  bios.set(mdFixture());
  bios.fill(32, 0x1f0, 0x200);
  bios.write(region, 0x1f0);
  return bios;
}

export function discTrack(region = "J", sector = 2352) {
  const bytes = Buffer.alloc(sector * 128);
  const offset = sector === 2352 ? 16 : 0;
  bytes.write("SEGADISCSYSTEM ", offset);
  bytes.write("SEGA MEGA DRIVE ", offset + 0x100);
  bytes.fill(32, offset + 0x1f0, offset + 0x200);
  bytes.write(region, offset + 0x1f0);
  return bytes;
}

export const discCue = 'FILE "GAME.BIN" BINARY\n TRACK 01 MODE1/2352\n INDEX 01 00:00:00\n';
export function discArchive(cue = discCue, extras: Record<string, Uint8Array> = {}) {
  return zipSync({ "game.cue": Buffer.from(cue), "game.bin": discTrack(), ...extras });
}
