/** Original generated compatibility metadata and tables, without commercial game assets. */
export function phantasyStar4RulesFixture(program?: Uint8Array) {
  const bytes = new Uint8Array(0x2ab048);
  if (program) bytes.set(program);
  const data = new DataView(bytes.buffer);
  for (const [offset, text] of [
    [0x100, "SEGA MEGA DRIVE"],
    [0x120, "PHANTASY STAR"],
    [0x160, "V1.6 By Ken Tse"],
  ] as const)
    bytes.set(new TextEncoder().encode(text), offset);
  data.setUint32(0x1a4, bytes.length - 1);
  data.setUint16(0x5f878, 0x45f9);
  data.setUint32(0x5f87a, 0x2aa288);
  data.setUint16(0x3e5c, 0x47fa);
  data.setInt16(0x3e5e, 0x3f8e - 0x3e5e);
  for (let character = 0; character < 11; character++) {
    const pointer = 0x100000 + character * 2200;
    data.setUint16(0x3f8e + character * 6, 1);
    data.setUint32(0x3f90 + character * 6, pointer);
    for (let level = 1; level < 99; level++) {
      const offset = pointer + (level - 1) * 22;
      data.setUint32(offset, level * 1000);
      data.setUint16(offset + 4, 40 + level);
      data.setUint16(offset + 6, 10);
    }
  }
  bytes[0x100000 + 12] = 1;
  bytes[0x100000 + 22 + 12] = 1; // Both events append, including duplicate IDs.
  bytes[0x100000 + 97 * 22 + 13] = 54;
  bytes[0x2aa288 + 11] = 0xff;
  bytes[0x2aa288 + 12] = 0x80;
  bytes[0x2aa288 + 13] = 127;
  bytes[0x2aa288 + 159 * 22 + 17] = 31;
  return bytes;
}
