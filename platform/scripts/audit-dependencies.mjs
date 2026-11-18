import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { reviewAudit } from "./dependency-audit.mjs";

assert.ok(process.env.npm_execpath, "Run npm run audit:dependencies from platform/");
const result = spawnSync(process.execPath, [process.env.npm_execpath, "audit", "--json"], {
  encoding: "utf8",
  timeout: 120_000,
  maxBuffer: 8 * 1024 * 1024,
});
if (result.error) throw result.error;
const report = JSON.parse(result.stdout);
// Preserve every finding, including the accepted risk, in the CI log.
console.log(JSON.stringify(report, null, 2));
const exception = JSON.parse(readFileSync("security-exception.json", "utf8"));
const review = reviewAudit(report, {
  exception,
  status: result.status,
  lockBytes: readFileSync("package-lock.json"),
  browser: JSON.parse(readFileSync("dist/client/BROWSER_DEPENDENCIES.json", "utf8")),
});
if (review.accepted.length) {
  console.warn(
    `Accepted GHSA-fc5q-39xc-vjpf until ${exception.expiresAt}: ${review.accepted.join(", ")}`,
  );
  if (process.env.GITHUB_ACTIONS)
    console.warn(
      "::warning::Temporary Picomatch risk exception used; see the full audit report and expiry above.",
    );
}
assert.deepEqual(review.blocked, [], `Unaccepted security findings: ${review.blocked.join(", ")}`);
