import { zipSync } from "fflate";
import { mdFixture } from "./sega-fixtures.ts";

/** Original firmware program and synthetic disc; no vendor BIOS or game bytes. */
export function discBios(region = "J") {
  const bios = Buffer.alloc(131072);
  bios.set(mdFixture());
  bios.fill(0, 0x1b0, 0x1bc); // Firmware has no MD cartridge SRAM header.
  const program = Buffer.from(bios.subarray(0x200, 0x400));
  for (let offset = 0; offset < program.length - 3; offset += 2) {
    // Reuse the original program's sentinel logic at the CD RAM cart address.
    if (program.readUInt32BE(offset) === 0x00200000) program.writeUInt32BE(0x00600001, offset);
  }
  // Enable cart writes and exercise its final byte as well as its first byte.
  bios.set([0x13, 0xfc, 0, 1, 0, 0x70, 0, 1, 0x13, 0xfc, 0, 0x55, 0, 0x61, 0xff, 0xff], 0x200);
  bios.set(program, 0x210);
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
  // PicoDrive identifies the disc region from its boot-code marker.
  bytes[offset + 0x20b] = region === "J" ? 0xa1 : region === "E" ? 0x64 : 0;
  return bytes;
}

export const discCue = 'FILE "GAME.BIN" BINARY\n TRACK 01 MODE1/2352\n INDEX 01 00:00:00\n';
export function discArchive(cue = discCue, extras: Record<string, Uint8Array> = {}) {
  return zipSync({ "game.cue": Buffer.from(cue), "game.bin": discTrack(), ...extras });
}
