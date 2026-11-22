import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { runtimeIdentities } from "../../scripts/runtime-identities.ts";
import { assertSnapshotBinding } from "../../src/editors/snapshots/binding.ts";

const lock = JSON.parse(readFileSync(new URL("../../runtime-lock.json", import.meta.url), "utf8"));
const identities = runtimeIdentities(lock);

it.each(["genesis_plus_gx", "picodrive"] as const)(
  "binds %s memory parsing to the reviewed archive identity",
  (core) => {
    const binding = { core, domain: "main" as const };
    const runtime = { adapter: "emulatorjs", core, version: identities[core] ?? "" };
    expect(() => assertSnapshotBinding(runtime, binding)).not.toThrow();
    for (const invalid of [
      undefined,
      { ...runtime, adapter: "other" },
      { ...runtime, core: "other" },
      { ...runtime, version: "new-unreviewed-build" },
    ])
      expect(() => assertSnapshotBinding(invalid, binding)).toThrow();
  },
);
