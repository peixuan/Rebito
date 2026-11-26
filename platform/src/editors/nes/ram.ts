import { MessageError, message } from "../../shared/messages.ts";
import { retroArchMemoryRegion } from "../../shared/retroarch-state.ts";

export const nesRamSize = 0x800;
export const nesCheatRuntime = "4968117d922665bf79a612eeb3691b88709f404804a7387e5e765bdf757e6d1c";
const invalid = () => new MessageError(message("editor.invalidSave"));

/** Read the CPU RAM record in the pinned FCEUmm FCS state. Other chunks are mapper-specific. */
export function readNesRam(snapshot: Uint8Array): Uint8Array {
  const { offset, size } = retroArchMemoryRegion(snapshot, invalid);
  const data = new DataView(snapshot.buffer, snapshot.byteOffset + offset, size);
  if (size < 16 || data.getUint32(0) !== 0x464353ff || data.getUint32(8, true) !== 9813)
    throw invalid();
  const bodyEnd = 16 + data.getUint32(4, true);
  // The writer emits the empty mapper chunk header but excludes its five bytes
  // from the FCS body length when the board registers no extra state.
  if (
    bodyEnd !== size &&
    !(
      bodyEnd + 5 === size &&
      data.getUint8(bodyEnd) === 0x10 &&
      data.getUint32(bodyEnd + 1, true) === 0
    )
  )
    throw invalid();
  let ram: Uint8Array | undefined;
  let foundCpu = false;
  for (let chunk = 16; chunk < bodyEnd; ) {
    if (chunk + 5 > bodyEnd) throw invalid();
    const start = chunk + 5;
    const end = start + data.getUint32(chunk + 1, true);
    if (end > bodyEnd) throw invalid();
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
