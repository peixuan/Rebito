/** Our own mapper-0 program: initialize SRAM[0], then display a green background. */
export function nesFixture(): Uint8Array {
  const rom = new Uint8Array(16 + 16_384 + 8192);
  rom.set([0x4e, 0x45, 0x53, 0x1a, 1, 1, 2, 0, 1]); // iNES; battery-backed 8 KiB RAM.
  const program = [
    0x78,
    0xd8,
    0xa2,
    0xff,
    0x9a, // SEI; CLD; LDX #$FF; TXS.
    0xe8,
    0x8e,
    0x00,
    0x20,
    0x8e,
    0x01,
    0x20, // Disable PPU interrupts/rendering.
    0xad,
    0x00,
    0x60,
    0xc9,
    0x43,
    0xf0,
    0x05, // Preserve an imported $43 sentinel.
    0xa9,
    0x42,
    0x8d,
    0x00,
    0x60, // Otherwise write $42 to battery RAM.
    0x2c,
    0x02,
    0x20, // Reset the PPU address latch.
    0xa9,
    0x3f,
    0x8d,
    0x06,
    0x20,
    0xa9,
    0x00,
    0x8d,
    0x06,
    0x20,
    0xa9,
    0x2a,
    0x8d,
    0x07,
    0x20, // Universal background palette entry.
    0xa9,
    0x08,
    0x8d,
    0x01,
    0x20, // Enable the background layer.
  ];
  const poll = program.length;
  program.push(
    0xa9,
    1,
    0x8d,
    0x16,
    0x40,
    0xa9,
    0,
    0x8d,
    0x16,
    0x40, // Latch controller.
    0xad,
    0x16,
    0x40,
    0x29,
    1,
    0xf0, // Read A; BEQ poll until pressed.
  );
  program.push((poll - program.length - 1) & 255);
  program.push(
    0x2c,
    2,
    0x20,
    0xa9,
    0x3f,
    0x8d,
    6,
    0x20,
    0xa9,
    0,
    0x8d,
    6,
    0x20,
    0xa9,
    0x21,
    0x8d,
    7,
    0x20, // A changes volatile PPU state from green to blue.
  );
  const loop = 0x8000 + program.length;
  rom.set([...program, 0x4c, loop & 255, loop >> 8], 16);
  for (const vector of [0x3ffa, 0x3ffc, 0x3ffe]) rom.set([0x00, 0x80], 16 + vector);
  return rom;
}
