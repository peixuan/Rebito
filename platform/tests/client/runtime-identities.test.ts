import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { runtimeIdentities } from "../../scripts/runtime-identities.ts";

const lock = JSON.parse(readFileSync("runtime-lock.json", "utf8"));
const baselinePackages = lock.packages.filter(
  (entry: { id: string }) => entry.id in lock.snapshotBaseline.integrities,
);

it("retains existing snapshots when adding unrelated emulation cores", () => {
  const original = { version: 1, packages: baselinePackages };
  expect(createHash("sha256").update(JSON.stringify(original)).digest("hex")).toBe(
    lock.snapshotBaseline.version,
  );
  const expanded = {
    ...lock,
    packages: [...lock.packages, { id: "extra-1.0", integrity: "fixture-new-core", core: true }],
  };
  expect(runtimeIdentities(expanded)).toMatchObject(runtimeIdentities(lock));
  for (const core of ["dosbox", "fceumm", "snes9x", "gambatte", "mgba"])
    expect(runtimeIdentities(expanded)[core]).toBe(lock.snapshotBaseline.version);
});

it("invalidates only the affected core when its bytes change, and all consoles for a wrapper change", () => {
  const changed = structuredClone(lock);
  changed.packages.find((entry: { id: string }) => entry.id === "fceumm-4.2.3").integrity =
    "changed";
  const identities = runtimeIdentities(changed);
  expect(identities.fceumm).not.toBe(lock.snapshotBaseline.version);
  expect(identities.snes9x).toBe(lock.snapshotBaseline.version);
  changed.packages.find((entry: { id: string }) => entry.id === "emulatorjs-4.2.3").integrity =
    "changed";
  expect(runtimeIdentities(changed).snes9x).not.toBe(lock.snapshotBaseline.version);
  expect(runtimeIdentities(changed).dosbox).toBe(lock.snapshotBaseline.version);
  expect(() => runtimeIdentities({ ...lock, packages: [] })).toThrow("Missing runtime wrapper");
});
