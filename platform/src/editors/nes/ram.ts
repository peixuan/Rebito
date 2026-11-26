import { MessageError, message } from "../../shared/messages.ts";
import { retroArchMemoryRegion } from "../snapshots/memory.ts";

export const nesRamSize = 0x800;
export const nesCheatRuntime = "4968117d922665bf79a612eeb3691b88709f404804a7387e5e765bdf757e6d1c";
const invalid = () => new MessageError(message("editor.invalidSave"));

/** Read the CPU RAM record in the pinned FCEUmm FCS state. Other chunks are mapper-specific. */
export function readNesRam(snapshot: Uint8Array): Uint8Array {
  const { offset, size } = retroArchMemoryRegion(snapshot);
  const data = new DataView(snapshot.buffer, snapshot.byteOffset + offset, size);
  if (
    size < 16 ||
    data.getUint32(0) !== 0x464353ff ||
    data.getUint32(4, true) !== size - 16 ||
    data.getUint32(8, true) !== 9813
  )
    throw invalid();
  let ram: Uint8Array | undefined;
  let foundCpu = false;
  for (let chunk = 16; chunk < size; ) {
    if (chunk + 5 > size) throw invalid();
    const start = chunk + 5;
    const end = start + data.getUint32(chunk + 1, true);
    if (end > size) throw invalid();
    if (data.getUint8(chunk) === 1) {
      if (foundCpu) throw invalid();
      foundCpu = true;
      for (let record = start; record < end; ) {
        if (record + 8 > end) throw invalid();
        const length = data.getUint32(record + 4, true);
        const next = record + 8 + length;
        if (next > end) throw invalid();
        if (data.getUint32(record) === 0x52414d00) {
          if (ram || length !== nesRamSize) throw invalid();
          ram = new Uint8Array(snapshot.subarray(offset + record + 8, offset + next));
        }
        record = next;
      }
    }
    chunk = end;
  }
  if (!ram) throw invalid();
  return ram;
}
