/** Original synthetic RAM, with no game, translation or emulator data embedded. */
export function phantasyStar4Fixture(): Uint8Array {
  const bytes = new Uint8Array(0x10000);
  const data = new DataView(bytes.buffer);
  bytes.set([0, 1, 0xff, 0xff, 0xff], 0xf40a);
  bytes.set([1, 2, 1, 160], 0xf410);
  data.setUint32(0xf438, 500);
  for (let index = 0; index < 11; index++) {
    const offset = 0xf500 + index * 0x80;
    data.setUint16(offset + 8, index + 1);
    data.setUint32(offset + 0x0a, index * 256);
    data.setUint16(offset + 0x0e, 40 + index);
    data.setUint16(offset + 0x10, 60 + index);
    data.setUint16(offset + 0x12, 20 + index);
    data.setUint16(offset + 0x14, 30 + index);
    bytes.set([1, 2], offset + 0x52);
    bytes.set([1, 2], offset + 0x62);
    bytes.set([3, 5, 2, 4], offset + 0x6a);
  }
  bytes.set([0xde, 0xad, 0xbe, 0xef], 0x200);
  return bytes;
}
