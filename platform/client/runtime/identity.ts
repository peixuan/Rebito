import type { RuntimeIdentity } from "../../src/domain/artifacts.ts";
import type { Game } from "../../src/library/catalog.ts";
import { MessageError, message } from "../../src/shared/messages.ts";

declare const __RUNTIME_FINGERPRINTS__: Record<string, string>;
const cores = { dos: "dosbox", nes: "fceumm", snes: "snes9x", gb: "gambatte", gba: "mgba" };
export function runtimeIdentity(system: Game["system"]): RuntimeIdentity {
  const version = __RUNTIME_FINGERPRINTS__[cores[system]];
  if (!version) throw new MessageError(message("runtime.identityMissing"));
  return {
    adapter: system === "dos" ? "jsdos" : "emulatorjs",
    core: cores[system],
    version,
  };
}
