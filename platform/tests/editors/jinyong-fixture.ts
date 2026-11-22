/** Original synthetic DOS layout. No names, saves or resources copied from the game. */
export function jinyongFixture(): Uint8Array {
  const bytes = new Uint8Array(114_242).fill(0xa5);
  const data = new DataView(bytes.buffer);
  bytes.fill(0, 0, 836);
  for (let slot = 0; slot < 6; slot++) data.setInt16(24 + slot * 2, slot === 0 ? 0 : -1, true);
  for (let slot = 0; slot < 200; slot++) data.setInt16(36 + slot * 4, -1, true);
  for (const [base, count, stride, nameOffset, nameLength] of [
    [836, 320, 182, 8, 10],
    [59_076, 200, 190, 2, 20],
    [97_076, 84, 52, 2, 10],
    [101_444, 93, 136, 2, 10],
  ] as const) {
    for (let index = 0; index < count; index++) {
      const offset = base + index * stride;
      data.setInt16(offset, index, true);
      bytes.fill(0, offset + nameOffset, offset + nameOffset + nameLength);
      bytes.set(new TextEncoder().encode(`Test${index}`), offset + nameOffset);
    }
  }
  data.setInt16(0x366, 32, true);
  data.setInt16(0x368, 40, true);
  data.setInt16(36, 174, true);
  data.setInt16(38, 100, true);
  return bytes;
}
