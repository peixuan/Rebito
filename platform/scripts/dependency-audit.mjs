import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const advisory = "https://github.com/advisories/GHSA-fc5q-39xc-vjpf";
const severities = new Set(["info", "low", "moderate", "high", "critical"]);

/** The owner approved one exact build-only risk, for at most thirty days. */
export function validateException(exception, lockBytes, browser, now = new Date()) {
  if (exception === null) return;
  assert.equal(exception.advisory, advisory);
  assert.equal(exception.package, "picomatch");
  assert.equal(exception.version, "4.0.7");
  const approved = Date.parse(exception.approvedAt);
  const expires = Date.parse(exception.expiresAt);
  assert.ok(Number.isFinite(approved) && Number.isFinite(expires), "Invalid exception dates");
  assert.ok(
    expires > approved && expires - approved <= 30 * 86400_000,
    "Exception exceeds thirty days",
  );
  assert.ok(
    now.getTime() >= approved && now.getTime() < expires,
    "Security exception is inactive or expired",
  );
  assert.equal(
    createHash("sha256").update(lockBytes).digest("hex"),
    exception.lockfileSha256,
    "Dependency lock changed; reassess the exception",
  );
  const lock = JSON.parse(lockBytes);
  const matches = Object.entries(lock.packages).filter(([path]) =>
    /(^|\/)node_modules\/picomatch$/.test(path),
  );
  assert.equal(matches.length, 1, "Unexpected matcher dependency layout");
  assert.equal(matches[0][0], "node_modules/picomatch");
  assert.equal(matches[0][1].version, exception.version);
  assert.equal(browser.version, 1);
  assert.ok(
    Array.isArray(browser.packages) && browser.packages.length > 0,
    "Missing browser inventory",
  );
  for (const item of browser.packages) {
    assert.equal(typeof item.name, "string");
    assert.equal(typeof item.version, "string");
    assert.notEqual(item.name, exception.package, "Excepted matcher was shipped to browsers");
  }
}

/** Resolve every transitive cause, including cycles, without waiving other advisories. */
function causes(name, vulnerabilities) {
  const pending = [name];
  const visited = new Set();
  const advisories = [];
  while (pending.length) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    const entry = vulnerabilities[current];
    assert.ok(
      entry && Array.isArray(entry.via) && entry.via.length,
      `Unresolved audit cause: ${current}`,
    );
    for (const cause of entry.via) {
      if (typeof cause === "string") pending.push(cause);
      else {
        assert.ok(cause && typeof cause.name === "string" && typeof cause.url === "string");
        assert.ok(severities.has(cause.severity), "Unknown advisory severity");
        advisories.push(cause);
      }
    }
  }
  assert.ok(advisories.length, `Audit cycle has no advisory: ${name}`);
  return advisories;
}

/** Keep all high/critical findings blocking except the exact approved root cause. */
export function reviewAudit(report, context) {
  validateException(context.exception, context.lockBytes, context.browser, context.now);
  assert.ok(context.status === 0 || context.status === 1, "npm audit did not complete");
  assert.equal(report.auditReportVersion, 2);
  assert.ok(!report.error && report.metadata?.vulnerabilities, "Audit service failed");
  assert.ok(
    report.vulnerabilities &&
      typeof report.vulnerabilities === "object" &&
      !Array.isArray(report.vulnerabilities),
  );
  const accepted = [];
  const blocked = [];
  for (const [name, entry] of Object.entries(report.vulnerabilities)) {
    assert.ok(severities.has(entry.severity), "Unknown package severity");
    if (!["high", "critical"].includes(entry.severity)) continue;
    const roots = causes(name, report.vulnerabilities);
    const allowed =
      context.exception !== null &&
      entry.severity === "high" &&
      roots.every(
        (cause) =>
          cause.url === advisory &&
          cause.name === "picomatch" &&
          cause.dependency === "picomatch" &&
          cause.severity === "high" &&
          cause.range === "<=4.0.7",
      );
    (allowed ? accepted : blocked).push(name);
  }
  const high = report.metadata.vulnerabilities.high;
  const critical = report.metadata.vulnerabilities.critical;
  assert.ok(Number.isInteger(high) && high >= 0 && Number.isInteger(critical) && critical >= 0);
  assert.equal(accepted.length + blocked.length, high + critical, "Incomplete audit report");
  return { accepted, blocked };
}
