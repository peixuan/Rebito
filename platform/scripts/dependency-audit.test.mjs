import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { reviewAudit, validateException } from "./dependency-audit.mjs";

const exception = JSON.parse(readFileSync(new URL("../security-exception.json", import.meta.url)));
const lockBytes = Buffer.from(
  JSON.stringify({ packages: { "node_modules/picomatch": { version: "4.0.7" } } }),
);
const context = () => ({
  exception: { ...exception, lockfileSha256: createHash("sha256").update(lockBytes).digest("hex") },
  lockBytes,
  status: 1,
  browser: { version: 1, packages: [{ name: "vue", version: "3.5.45" }] },
  now: new Date("2026-11-19T00:00:00Z"),
});
const cause = () => ({
  name: "picomatch",
  dependency: "picomatch",
  url: exception.advisory,
  severity: "high",
  range: "<=4.0.7",
});
const report = () => ({
  auditReportVersion: 2,
  metadata: { vulnerabilities: { high: 3, critical: 0 } },
  vulnerabilities: {
    picomatch: { severity: "high", via: [cause()] },
    vite: { severity: "high", via: ["vitest", "picomatch"] },
    vitest: { severity: "high", via: ["vite"] },
  },
});

it("accepts only the approved cause through transitive dependency cycles", () => {
  expect(reviewAudit(report(), context())).toEqual({
    accepted: ["picomatch", "vite", "vitest"],
    blocked: [],
  });
});
it("keeps unrelated findings blocking, including a second cause in the same package", () => {
  const input = report();
  input.vulnerabilities.vite.via.push({
    ...cause(),
    url: "https://github.com/advisories/GHSA-other",
  });
  expect(reviewAudit(input, context()).blocked).toEqual(["vite", "vitest"]);
});
it("does not waive a different package, severity, range or advisory", () => {
  for (const change of [
    { name: "other" },
    { dependency: "other" },
    { severity: "critical" },
    { range: "*" },
    { url: "https://example.test" },
  ]) {
    const input = report();
    Object.assign(input.vulnerabilities.picomatch.via[0], change);
    expect(reviewAudit(input, context()).blocked).toHaveLength(3);
  }
});
it("rejects future, expired, malformed and extended approvals", () => {
  const base = context();
  for (const now of [
    new Date("2026-11-18T03:13:53Z"),
    new Date(exception.expiresAt),
    new Date("invalid"),
  ]) {
    expect(() => validateException(base.exception, lockBytes, base.browser, now)).toThrow();
  }
  for (const expiresAt of ["invalid", "2026-12-19T03:13:54Z"]) {
    expect(() =>
      validateException({ ...base.exception, expiresAt }, lockBytes, base.browser, base.now),
    ).toThrow();
  }
});
it("rejects changed dependency locks and a matcher shipped in a browser chunk", () => {
  const base = context();
  expect(() => reviewAudit(report(), { ...base, lockBytes: Buffer.from("{}") })).toThrow();
  base.browser.packages.push({ name: "picomatch", version: "4.0.7" });
  expect(() => reviewAudit(report(), base)).toThrow();
});
it("requires the reviewed package version and exact installation location", () => {
  const base = context();
  const changed = Buffer.from(
    JSON.stringify({ packages: { "node_modules/picomatch": { version: "4.0.6" } } }),
  );
  base.exception.lockfileSha256 = createHash("sha256").update(changed).digest("hex");
  expect(() => reviewAudit(report(), { ...base, lockBytes: changed })).toThrow();
});
it("fails closed on audit errors, missing causes and inconsistent counts", () => {
  for (const change of [
    { error: { message: "Unavailable" } },
    { vulnerabilities: {} },
    { auditReportVersion: 1 },
  ]) {
    expect(() => reviewAudit({ ...report(), ...change }, context())).toThrow();
  }
  expect(() => reviewAudit(report(), { ...context(), status: null })).toThrow();
  const input = report();
  delete input.vulnerabilities.picomatch;
  expect(() => reviewAudit(input, context())).toThrow();
  input.vulnerabilities.vite.via = ["vitest"];
  expect(() => reviewAudit(input, context())).toThrow();
});
it("blocks every high finding without an exception and accepts a clean report", () => {
  expect(reviewAudit(report(), { ...context(), exception: null }).blocked).toHaveLength(3);
  expect(
    reviewAudit(
      {
        auditReportVersion: 2,
        metadata: { vulnerabilities: { high: 0, critical: 0 } },
        vulnerabilities: {},
      },
      { ...context(), exception: null, status: 0 },
    ),
  ).toEqual({ accepted: [], blocked: [] });
});
