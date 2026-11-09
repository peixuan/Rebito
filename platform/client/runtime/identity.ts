import type { RuntimeIdentity } from "../../src/domain/artifacts.ts";
import type { Game } from "../../src/library/catalog.ts";
import { MessageError, message } from "../../src/shared/messages.ts";
import { consoleSystems } from "./console-systems.ts";

declare const __RUNTIME_FINGERPRINTS__: Record<string, string>;
export function runtimeIdentity(system: Game["system"]): RuntimeIdentity {
  const core = system === "dos" ? "dosbox" : consoleSystems[system].core;
  const version = __RUNTIME_FINGERPRINTS__[core];
  if (!version) throw new MessageError(message("runtime.identityMissing"));
  return {
    adapter: system === "dos" ? "jsdos" : "emulatorjs",
    core,
    version,
  };
}
