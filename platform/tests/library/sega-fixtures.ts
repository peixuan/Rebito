/** Original 68000 program: cartridge SRAM sentinel and a blue VDP backdrop. */
export function mdFixture(): Uint8Array {
  const rom = new Uint8Array(32_768);
  const view = new DataView(rom.buffer);
  view.setUint32(0, 0xff8000); // Initial stack and reset entry, big endian.
  view.setUint32(4, 0x200);
  rom.set(new TextEncoder().encode("SEGA MEGA DRIVE "), 0x100);
  rom.set(new TextEncoder().encode("RETRO PORTAL ORIGINAL FIXTURE"), 0x120);
  rom.set(new TextEncoder().encode("RETRO PORTAL ORIGINAL FIXTURE"), 0x150);
  rom[0x190] = 0x4a; // Joypad.
  view.setUint32(0x1a4, rom.length - 1);
  view.setUint32(0x1a8, 0xff0000);
  view.setUint32(0x1ac, 0xffffff);
  rom.set([0x52, 0x41, 0xa0, 0x20], 0x1b0); // Backup SRAM, both byte lanes.
  view.setUint32(0x1b4, 0x200000);
  view.setUint32(0x1b8, 0x20ffff);
  rom.set(new TextEncoder().encode("JUE"), 0x1f0);
  const words = [
    0x46fc,
    0x2700, // MOVE #$2700,SR: interrupts disabled.
    0x23fc,
    0x5345,
    0x4741,
    0x00a1,
    0x4000, // TMSS handshake.
    0x1039,
    0x0020,
    0x0000, // MOVE.B SRAM,D0.
    0x0c00,
    0x0043,
    0x6708, // Preserve imported sentinel $43.
    0x13fc,
    0x0042,
    0x0020,
    0x0000, // Otherwise write $42 to SRAM.
    0x33fc,
    0x8004,
    0x00c0,
    0x0004, // VDP register 0.
    0x33fc,
    0x8104,
    0x00c0,
    0x0004, // Mode 5, display off during setup.
    0x33fc,
    0x8700,
    0x00c0,
    0x0004, // Background palette index 0.
    0x33fc,
    0x8c81,
    0x00c0,
    0x0004, // 320-pixel scanlines.
    0x23fc,
    0xc000,
    0x0000,
    0x00c0,
    0x0004, // CRAM write address 0.
    0x33fc,
    0x0e00,
    0x00c0,
    0x0000, // Blue palette color.
    0x0c00,
    0x0043,
    0x6612, // Imported sentinel selects red, observable in snapshots without SRAM.
    0x23fc,
    0xc000,
    0x0000,
    0x00c0,
    0x0004,
    0x33fc,
    0x000e,
    0x00c0,
    0x0000,
    0x33fc,
    0x8144,
    0x00c0,
    0x0004, // Enable display.
    0x13fc,
    0x0040,
    0x00a1,
    0x0009, // Controller TH output.
    0x13fc,
    0x0040,
    0x00a1,
    0x0003, // TH high: direction/B/C buttons.
    0x1039,
    0x00a1,
    0x0003, // Read controller 1.
    0x0200,
    0x003f,
    0x0c00,
    0x003f,
    0x67f0, // Wait until a button is pressed (active low).
    0x23fc,
    0xc000,
    0x0000,
    0x00c0,
    0x0004,
    0x33fc,
    0x000e,
    0x00c0,
    0x0000, // Latch red after real input.
    0x60fe, // BRA to itself.
  ];
  words.forEach((word, index) => {
    view.setUint16(0x200 + index * 2, word);
  });
  let checksum = 0;
  for (let offset = 0x200; offset < rom.length; offset += 2) checksum += view.getUint16(offset);
  view.setUint16(0x18e, checksum & 0xffff);
  return rom;
}

/** Same original program in the 512-byte-header, interleaved SMD dump format. */
export function smdFixture(): Uint8Array {
  const source = mdFixture();
  const output = new Uint8Array(source.length + 512);
  output.set([source.length / 16384, 3, 0]);
  output.set([0xaa, 0xbb, 6], 8);
  for (let base = 0; base < source.length; base += 16384)
    for (let offset = 0; offset < 8192; offset++) {
      output[512 + base + offset] = source[base + offset * 2 + 1] ?? 0;
      output[512 + base + 8192 + offset] = source[base + offset * 2] ?? 0;
    }
  return output;
}

/** Original Z80 program using the Sega mapper's battery RAM and a blue backdrop. */
export function sega8Fixture(gameGear = false): Uint8Array {
  const rom = new Uint8Array(65_536); // Above 32 KiB so the core selects the Sega mapper.
  const code = [
    0xf3,
    0x31,
    0xf0,
    0xdf, // DI; LD SP,$DFF0.
    0x3e,
    0x08,
    0x32,
    0xfc,
    0xff, // Map SRAM at $8000 through $FFFC.
    0x3a,
    0x00,
    0x80,
    0xfe,
    0x43,
    0x28,
    0x05, // Preserve imported $43.
    0x3e,
    0x42,
    0x32,
    0x00,
    0x80, // Otherwise store $42.
  ];
  const out = (port: number, value: number) => code.push(0x3e, value, 0xd3, port);
  const register = (index: number, value: number) => {
    out(0xbf, value);
    out(0xbf, 0x80 | index);
  };
  register(0, 4); // Mode 4.
  register(1, 0); // Display off during CRAM setup.
  register(7, 0); // Background palette index 16.
  out(0xbf, gameGear ? 32 : 16);
  out(0xbf, 0xc0);
  out(0xbe, gameGear ? 0 : 0x30);
  if (gameGear) out(0xbe, 0x0f); // GG uses two-byte 12-bit colors.
  code.push(0x3a, 0x00, 0x80, 0xfe, 0x43, 0x20, gameGear ? 16 : 12);
  out(0xbf, gameGear ? 32 : 16);
  out(0xbf, 0xc0);
  out(0xbe, gameGear ? 0x0f : 3); // Imported sentinel selects red.
  if (gameGear) out(0xbe, 0);
  register(1, 0); // Blank tile layers; expose the backdrop without uninitialized VRAM.
  code.push(0xdb, 0xdc, 0xe6, 0x3f, 0xfe, 0x3f, 0x28, 0xf8); // Wait for controller 1.
  out(0xbf, gameGear ? 32 : 16);
  out(0xbf, 0xc0);
  out(0xbe, gameGear ? 0x0f : 3); // Latch red after real input.
  if (gameGear) out(0xbe, 0);
  code.push(0x18, 0xfe); // JR to itself.
  rom.set(code);
  rom.set(new TextEncoder().encode("TMR SEGA"), 0x7ff0);
  rom[0x7fff] = gameGear ? 0x6e : 0x4e; // Export model, 64 KiB ROM.
  const checksum = rom.subarray(0, 0x7ff0).reduce((sum, byte) => sum + byte, 0) & 0xffff;
  new DataView(rom.buffer).setUint16(0x7ffa, checksum, true);
  return rom;
}
