import type { RuntimeIdentity } from "../../src/domain/artifacts.ts";
import type { Game } from "../../src/library/catalog.ts";

declare const __RUNTIME_FINGERPRINT__: string;
const cores = { dos: "dosbox", nes: "fceumm", snes: "snes9x", gb: "gambatte", gba: "mgba" };
export function runtimeIdentity(system: Game["system"]): RuntimeIdentity {
  return {
    adapter: system === "dos" ? "jsdos" : "emulatorjs",
    core: cores[system],
    version: __RUNTIME_FINGERPRINT__,
  };
}
