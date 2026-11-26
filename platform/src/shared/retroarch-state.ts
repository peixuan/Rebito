export interface SnapshotRegion {
  offset: number;
  size: number;
}
const text = new TextDecoder();
export function snapshotTag(bytes: Uint8Array, offset: number, size: number) {
  return text.decode(bytes.subarray(offset, offset + size));
}

/** RetroArch 6dd4353 RASTATE v1; sizes exclude each block's eight-byte padding. */
export function retroArchMemoryRegion(bytes: Uint8Array, invalid: () => Error): SnapshotRegion {
  if (
    bytes.length < 24 ||
    bytes.length > 64 * 1024 * 1024 ||
    snapshotTag(bytes, 0, 7) !== "RASTATE" ||
    bytes[7] !== 1
  )
    throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const seen = new Set<string>();
  let memory: SnapshotRegion | undefined;
  for (let offset = 8; offset + 8 <= bytes.length; ) {
    const tag = snapshotTag(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const next = offset + 8 + Math.ceil(size / 8) * 8;
    if (seen.has(tag) || seen.size >= 128 || next > bytes.length) throw invalid();
    seen.add(tag);
    if (tag === "END ") {
      if (size || next !== bytes.length || !memory) throw invalid();
      return memory;
    }
    if (tag === "MEM ") memory = { offset: offset + 8, size };
    offset = next;
  }
  throw invalid();
}
