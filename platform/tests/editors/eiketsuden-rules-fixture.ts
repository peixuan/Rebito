/** Original synthetic metadata; no game tables or translated game names. */
export function eiketsudenRulesFixture(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(19_328);
  const encoder = new TextEncoder();
  for (let id = 0; id < 384; id++) {
    const offset = 0x1100 + id * 21;
    bytes.set(encoder.encode(`C${String(id).padStart(5, "0")}`), offset);
    bytes.set([id % 101, (id + 1) % 101, (id + 2) % 101], offset + 17);
  }
  for (let id = 0; id < 63; id++) bytes.set(encoder.encode(`Item ${id}`), 0x0d00 + id * 16);
  return bytes;
}
