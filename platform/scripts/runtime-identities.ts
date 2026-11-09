import { createHash } from "node:crypto";

interface RuntimePackage {
  id: string;
  integrity: string;
  core?: boolean;
}
interface RuntimeLock {
  packages: RuntimePackage[];
  snapshotBaseline: { version: string; integrities: Record<string, string> };
}

/** Preserve the original deployment's identity only for unchanged verified bytes.
 * New/updated cores depend on their own archive and wrapper, never unrelated cores.
 * snapshotBaseline is migration evidence: do not refresh it during upgrades.
 */
export function runtimeIdentities(lock: RuntimeLock): Record<string, string> {
  const wrapper = lock.packages.find((entry) => entry.id.startsWith("emulatorjs-"));
  const dos = lock.packages.find((entry) => entry.id.startsWith("jsdos-"));
  if (!wrapper || !dos) throw new Error("Missing runtime wrapper");
  const bindings: [string, RuntimePackage[]][] = [["dosbox", [dos]]];
  for (const core of lock.packages.filter((entry) => entry.core))
    bindings.push([core.id.replace(/-\d.*$/, ""), [wrapper, core]]);
  return Object.fromEntries(
    bindings.map(([core, packages]) => [
      core,
      packages.every((entry) => lock.snapshotBaseline.integrities[entry.id] === entry.integrity)
        ? lock.snapshotBaseline.version
        : createHash("sha256")
            .update(JSON.stringify(packages.map(({ id, integrity }) => ({ id, integrity }))))
            .digest("hex"),
    ]),
  );
}
