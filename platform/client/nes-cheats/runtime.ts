import { maxNesCodes, normalizeNesCode } from "../../src/editors/nes/codes.ts";
import { readNesRam } from "../../src/editors/nes/ram.ts";
import { MessageError, message } from "../../src/shared/messages.ts";

interface NesCore {
  getState(): Uint8Array;
  resetCheat(): void;
  setCheat(index: number, enabled: boolean, code: string): void;
}

export interface NesCheats {
  readonly romSha256: string;
  readRam(): Uint8Array;
  setCodes(codes: readonly string[]): void;
}

/** Rules belong to one runtime. Rebuild enabled entries because the core ignores disabled slots. */
export function createNesCheats(core: NesCore, romSha256: string): NesCheats {
  return {
    romSha256,
    readRam: () => readNesRam(core.getState()),
    setCodes(codes) {
      if (codes.length > maxNesCodes) throw new MessageError(message("nesCheats.invalidCode"));
      const checked = new Set<string>();
      for (const code of codes) {
        const normalized = normalizeNesCode(code);
        if (!normalized) throw new MessageError(message("nesCheats.invalidCode"));
        checked.add(normalized);
      }
      core.resetCheat();
      let index = 0;
      for (const code of checked) core.setCheat(index++, true, code);
    },
  };
}
