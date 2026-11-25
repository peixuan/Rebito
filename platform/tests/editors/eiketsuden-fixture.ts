/** Independently generated save layout; no proprietary save bytes or names. */
export function eiketsudenFixture(): Uint8Array {
  const bytes = new Uint8Array(8_789).fill(0xa5);
  const data = new DataView(bytes.buffer);
  data.setUint16(35, 500, true);
  for (let index = 0; index < 384; index++) {
    const offset = 1_685 + index * 18;
    bytes[offset] = index < 3 ? 0x80 : 0x8e;
    bytes[offset + 1] = index === 0 ? 0 : index < 3 ? 2 : 4;
    bytes[offset + 4] = 100;
    data.setUint16(offset + 5, 500, true);
    bytes[offset + 7] = index % 19;
    bytes[offset + 8] = 1;
    bytes[offset + 9] = 0;
    bytes.fill(255, offset + 10, offset + 18);
  }
  bytes[1_685 + 10] = 12;
  return bytes;
}

/** The companion is opaque to the editor; distinctive bytes detect accidental writes. */
export function eiketsudenCompanion(): Uint8Array {
  return Uint8Array.from({ length: 1_369 }, (_, index) => (index * 19 + 7) % 256);
}
