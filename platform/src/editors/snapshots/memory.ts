import { message } from "../../shared/messages.ts";
import {
  retroArchMemoryRegion,
  type SnapshotRegion,
  snapshotTag,
} from "../../shared/retroarch-state.ts";
import { EditorError } from "../types.ts";

export type SnapshotCore = "genesis_plus_gx" | "picodrive";
export type MemoryDomain = "main" | "program" | "word" | "backup";
export interface SnapshotMemory {
  /** Game byte order, independent of the core's word-swapped storage. */
  readonly bytes: Uint8Array;
  /** Replace only this region, retaining every other byte and container block. */
  replace(bytes: Uint8Array): Uint8Array;
}

const invalid = () => new EditorError("invalid_save", message("editor.invalidSave"));
const cdRegions = {
  main: { id: 2, size: 0x10000 },
  program: { id: 13, size: 0x80000 },
  word: { id: 14, size: 0x40000 },
  backup: { id: 16, size: 0x2000 },
} as const;

/** PicoDrive 3cf1e26 CD states reserve trailing capacity for optional 32X state. */
function cdRegion(bytes: Uint8Array, memory: SnapshotRegion, domain: MemoryDomain): SnapshotRegion {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    memory.size !== 1_560_538 ||
    snapshotTag(bytes, memory.offset, 8) !== "PicoSEXT" ||
    view.getUint32(memory.offset + 8, true) !== 0x191
  )
    throw invalid();
  const chunks = new Map<number, SnapshotRegion>();
  const end = memory.offset + memory.size;
  for (let offset = memory.offset + 12; offset + 5 <= end; ) {
    const id = bytes[offset] ?? 0;
    const size = view.getUint32(offset + 1, true);
    if (!id) {
      if (size) throw invalid();
      for (const expected of Object.values(cdRegions))
        if (chunks.get(expected.id)?.size !== expected.size) throw invalid();
      const selected = chunks.get(cdRegions[domain].id);
      if (!selected) throw invalid();
      return selected;
    }
    if (chunks.has(id) || offset + 5 + size > end) throw invalid();
    chunks.set(id, { offset: offset + 5, size });
    offset += 5 + size;
  }
  throw invalid();
}

/**
 * Decode only the pinned core format. Callers must separately verify the snapshot's
 * runtime identity and game association; a header does not establish either.
 */
export function openSnapshotMemory(
  snapshot: Uint8Array,
  core: SnapshotCore,
  domain: MemoryDomain = "main",
): SnapshotMemory {
  const original = new Uint8Array(snapshot);
  const memory = retroArchMemoryRegion(original, invalid);
  let region: SnapshotRegion;
  if (core === "genesis_plus_gx") {
    if (
      domain !== "main" ||
      memory.size !== 0xfd000 ||
      snapshotTag(original, memory.offset, 16) !== "GENPLUS-GX 1.7.6"
    )
      throw invalid();
    region = { offset: memory.offset + 16, size: 0x10000 };
  } else if (core === "picodrive" && Object.hasOwn(cdRegions, domain)) {
    region = cdRegion(original, memory, domain);
  } else {
    throw invalid();
  }
  // Both pinned 68000 cores serialize host-endian words; CD BRAM is byte storage.
  const swap = domain === "backup" ? 0 : 1;
  const bytes = new Uint8Array(region.size);
  for (let index = 0; index < bytes.length; index++)
    bytes[index] = original[region.offset + (index ^ swap)] ?? 0;
  return {
    bytes,
    replace(changed) {
      if (changed.length !== region.size) throw invalid();
      const output = original.slice();
      for (let index = 0; index < changed.length; index++)
        output[region.offset + (index ^ swap)] = changed[index] ?? 0;
      return output;
    },
  };
}
