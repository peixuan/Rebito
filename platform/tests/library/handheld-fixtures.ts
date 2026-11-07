/** Own MBC1 battery-RAM program, entered directly by the emulator without a BIOS. */
export function gbFixture(): Uint8Array {
  const rom = new Uint8Array(32_768);
  rom.set([0xc3, 0x50, 0x01], 0x100); // JP $0150; skip the cartridge header.
  rom.set(new TextEncoder().encode("RETRO PORTAL"), 0x134);
  rom.set([3, 0, 2], 0x147); // MBC1+RAM+battery; 32 KiB ROM; 8 KiB RAM.
  let checksum = 0;
  for (let offset = 0x134; offset <= 0x14c; offset++)
    checksum = (checksum - (rom[offset] ?? 0) - 1) & 255;
  rom[0x14d] = checksum;
  rom.set(
    [
      0xf3,
      0x31,
      0xfe,
      0xff, // DI; LD SP,$FFFE.
      0x3e,
      0x0a,
      0xea,
      0x00,
      0x00, // Enable MBC1 cartridge RAM.
      0xfa,
      0x00,
      0xa0,
      0xfe,
      0x43,
      0x28,
      0x05, // Preserve imported SRAM sentinel.
      0x3e,
      0x42,
      0xea,
      0x00,
      0xa0,
      0x3e,
      0xe4,
      0xea,
      0x47,
      0xff, // Background palette.
      0x3e,
      0x91,
      0xea,
      0x40,
      0xff, // LCD on.
      0x18,
      0xfe, // JR to itself.
    ],
    0x150,
  );
  return rom;
}

/** Own ARM program: SRAM sentinel and a solid mode-3 framebuffer. */
export function gbaFixture(): Uint8Array {
  const rom = new Uint8Array(32_768);
  const view = new DataView(rom.buffer);
  view.setUint32(0, 0xea00002e, true); // B $080000C0.
  rom.set(new TextEncoder().encode("RETRO PORTALRTST00"), 0xa0);
  rom[0xb2] = 0x96;
  let checksum = -0x19;
  for (let offset = 0xa0; offset < 0xbd; offset++) checksum -= rom[offset] ?? 0;
  rom[0xbd] = checksum & 255;
  const words: number[] = [];
  const literals: { index: number; value: number }[] = [];
  function load(register: number, value: number) {
    literals.push({ index: words.length, value });
    words.push(0xe59f0000 | (register << 12)); // LDR Rn,[PC,#literal_offset].
  }
  load(0, 0x0e000000);
  words.push(0xe5d01000, 0xe3510043, 0x13a01042, 0x15c01000); // Preserve $43, otherwise STRB $42.
  load(0, 0x04000000);
  load(1, 0x0403);
  words.push(0xe1c010b0); // STRH R1,[R0]: mode 3, BG2 enabled.
  load(0, 0x06000000);
  load(1, 0x03e0);
  load(2, 240 * 160);
  const loop = words.length;
  words.push(0xe0c010b2, 0xe2522001); // STRH R1,[R0],#2; SUBS R2,R2,#1.
  words.push(0x1a000000 | ((loop - words.length - 2) & 0xffffff)); // BNE fill loop.
  words.push(0xeafffffe); // B to itself.
  for (const literal of literals) {
    words[literal.index] = (words[literal.index] ?? 0) | ((words.length - literal.index - 2) * 4);
    words.push(literal.value);
  }
  words.forEach((word, index) => {
    view.setUint32(0xc0 + index * 4, word, true);
  });
  rom.set(new TextEncoder().encode("SRAM_V113"), 0x200); // Standard save-hardware detection tag.
  return rom;
}
