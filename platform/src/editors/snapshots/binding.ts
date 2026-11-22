import type { RuntimeIdentity } from "../../domain/artifacts.ts";
import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import type { MemoryDomain, SnapshotCore } from "./memory.ts";

export interface SnapshotBinding {
  readonly core: SnapshotCore;
  readonly domain: MemoryDomain;
}

// A matching header alone is insufficient. New runtime builds require format review.
const versions: Record<SnapshotCore, string> = {
  genesis_plus_gx: "f4ccd1dd72e6b7287ae262620bddd9ae8ae174a24e3dcf10c4f33618001b66ac",
  picodrive: "cc478d21baa33f552bea2591f0ce3b8b37afa7108e550e625202937e39ecbada",
};

export function assertSnapshotBinding(
  runtime: RuntimeIdentity | undefined,
  binding: SnapshotBinding,
) {
  if (
    runtime?.adapter !== "emulatorjs" ||
    runtime.core !== binding.core ||
    runtime.version !== versions[binding.core]
  )
    throw new EditorError("unsupported_editor", message("runtime.snapshotMismatch"));
}
