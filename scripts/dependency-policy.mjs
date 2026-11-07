import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Exact reviewed expressions, not an SPDX parser. A new expression needs review.
const reviewedLicenses = new Set([
  "MIT",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "MPL-2.0",
  "MIT OR Apache-2.0",
]);

export function checkDependencies(lock) {
  if (lock.lockfileVersion !== 3 || !lock.packages || !lock.packages[""]) {
    throw new Error("Expected an npm v3 lockfile with a root package.");
  }
  const failures = [];
  let count = 0;
  for (const [path, dependency] of Object.entries(lock.packages)) {
    if (!path) continue; // The project license is a separate maintainer decision.
    count++;
    if (!reviewedLicenses.has(dependency.license)) {
      failures.push(`${path}: unreviewed license ${dependency.license ?? "(missing)"}`);
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
  return count;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const lock = JSON.parse(readFileSync(process.argv[2] ?? "platform/package-lock.json", "utf8"));
    console.log(`Reviewed license metadata: ${checkDependencies(lock)} locked packages`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
