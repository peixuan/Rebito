/** Own LoROM program: battery RAM sentinel and a green backdrop; no game data. */
export function snesFixture(): Uint8Array {
  const rom = new Uint8Array(32_768);
  rom.set([
    0x78,
    0xd8, // SEI; CLD (reset starts with 8-bit accumulator/index registers).
    0xa9,
    0x80,
    0x8d,
    0x00,
    0x21, // Force blank while changing CGRAM.
    0xaf,
    0x00,
    0x00,
    0x70,
    0xc9,
    0x43,
    0xf0,
    0x06,
    0xa9,
    0x42,
    0x8f,
    0x00,
    0x00,
    0x70, // SRAM $70:0000; preserve imported $43.
    0xa9,
    0x00,
    0x8d,
    0x21,
    0x21, // CGRAM index zero.
    0xa9,
    0xe0,
    0x8d,
    0x22,
    0x21,
    0xa9,
    0x03,
    0x8d,
    0x22,
    0x21,
    0xa9,
    0x0f,
    0x8d,
    0x00,
    0x21, // Display at full brightness.
    0x80,
    0xfe, // BRA to itself.
  ]);
  rom.set(new TextEncoder().encode("RETRO PORTAL TEST     "), 0x7fc0);
  rom.set([0x20, 0x02, 5, 3, 1, 1, 0], 0x7fd5); // LoROM, ROM+RAM+battery, 32K/8K.
  for (const offset of [0x7fea, 0x7fee, 0x7ffa, 0x7ffc, 0x7ffe]) rom.set([0, 0x80], offset);
  const checksum = (rom.reduce((sum, byte) => sum + byte, 0) + 510) & 0xffff;
  const view = new DataView(rom.buffer);
  view.setUint16(0x7fdc, checksum ^ 0xffff, true);
  view.setUint16(0x7fde, checksum, true);
  return rom;
}
