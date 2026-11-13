import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

// Operator-only HTTP capacity probe. Supply five disposable accounts on stdin.
// The output contains metrics, never credentials, cookies or game/save contents.
const config = JSON.parse(readFileSync(0, "utf8"));
const { origin, users, gameId, output } = config;
assert.equal(users.length, 5);
assert.ok(origin && output && gameId, "Explicit target, game and output are required");
assert.notEqual(new URL(origin).port, "3000", "Do not run against the local user deployment");
const rounds = config.rounds ?? 5;
const intervalMs = config.intervalMs ?? 30_000;
const saveBytes = config.saveBytes ?? 256 * 1024;
// History reads return at most 100 revisions per profile.
assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 100);
assert.ok(Number.isInteger(intervalMs) && intervalMs >= 0);
assert.ok(Number.isInteger(saveBytes) && saveBytes > 0 && saveBytes <= 64 * 1024 ** 2);
const events = [];
const accounts = [];
const started = Date.now();
const monotonicStarted = performance.now();
let monitoring = true;

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
async function request(path, options = {}) {
  return fetch(new URL(path, origin), {
    signal: AbortSignal.timeout(15 * 60_000),
    ...options,
  });
}
async function privateRequest(account, path, options = {}) {
  return request(path, {
    ...options,
    headers: { cookie: account.cookie, origin, ...options.headers },
  });
}
async function json(response, status = 200) {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}
function record(op, user, status, start, extra = {}) {
  events.push({
    op,
    user,
    status,
    atMs: start - monotonicStarted,
    ms: performance.now() - start,
    ...extra,
  });
}

// Provisioning is outside the measured workload; login timing is recorded separately.
for (const [index, credentials] of users.entries()) {
  let response;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const start = performance.now();
    response = await request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(credentials),
    });
    record("login", index, response.status, start, { attempt });
    if (response.status !== 429) break;
    await response.arrayBuffer();
    await delay(Math.max(10, Number(response.headers.get("retry-after")) || 10) * 1000 + 100);
  }
  await json(response);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const account = { cookie, index, head: null, revisions: [] };
  const profile = await json(
    await privateRequest(account, "/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ releaseId: gameId, name: `Capacity probe ${Date.now()}-${index}` }),
    }),
    201,
  );
  account.profileId = profile.id;
  accounts.push(account);
}
const game = (await json(await privateRequest(accounts[0], "/api/games"))).find(
  (entry) => entry.id === gameId,
);
assert.ok(game);

async function download(account) {
  const start = performance.now();
  try {
    const response = await privateRequest(account, `/api/games/${gameId}/asset`);
    assert.equal(response.status, 200);
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of response.body) {
      hash.update(chunk);
      bytes += chunk.length;
    }
    assert.equal(bytes, game.size);
    assert.equal(hash.digest("hex"), game.sha256);
    record("download", account.index, 200, start, { bytes, verified: true });
  } catch (error) {
    record("download", account.index, 0, start, { error: error.message });
  }
}

async function upload(account, bytes, attempt) {
  const start = performance.now();
  const body = new FormData();
  body.append(
    "metadata",
    JSON.stringify({ releaseId: gameId, kind: "game-save", baseRevision: account.head }),
  );
  body.append("file", new Blob([bytes]), "CAPACITY.BIN");
  try {
    const response = await privateRequest(account, `/api/profiles/${account.profileId}/revisions`, {
      method: "POST",
      body,
    });
    const result = await response.json();
    record("upload", account.index, response.status, start, {
      bytes: bytes.length,
      attempt,
      error: result.error,
    });
    if (response.status === 201) {
      account.head = result.id;
      account.revisions.push({ id: result.id, sha256: digest(bytes), size: bytes.length });
      return { done: true };
    }
    // Only an explicit pre-publication busy response is retried. Never mask 5xx,
    // ambiguous transport failures, stale heads or authorization failures.
    return {
      done: false,
      retry: response.status === 503 && result.error === "upload_busy",
      wait: Math.max(1, Number(response.headers.get("retry-after")) || 1) * 1000,
    };
  } catch (error) {
    record("upload", account.index, 0, start, { attempt, error: error.message });
    return { done: false, retry: false };
  }
}
async function synchronize(account, bytes) {
  const start = performance.now();
  for (let attempt = 1; attempt <= 8; attempt++) {
    const result = await upload(account, bytes, attempt);
    if (result.done) {
      record("sync", account.index, 201, start, { attempt });
      return;
    }
    if (!result.retry) break;
    await delay(result.wait + account.index * 100);
  }
  record("sync", account.index, 0, start);
}
async function saves() {
  for (let round = 0; round < rounds; round++) {
    const start = performance.now();
    // Unique bytes avoid benchmarking only content-addressed deduplication.
    const payloads = accounts.map(() => randomBytes(saveBytes));
    await Promise.all(accounts.map((account, index) => synchronize(account, payloads[index])));
    console.log(JSON.stringify({ phase: "round", round: round + 1, rounds, saveBytes }));
    if (round + 1 < rounds) await delay(Math.max(0, intervalMs - (performance.now() - start)));
  }
}
async function latency() {
  while (monitoring) {
    const start = performance.now();
    try {
      const response = await privateRequest(accounts[0], "/api/profiles");
      await response.arrayBuffer();
      record("metadata", 0, response.status, start);
    } catch (error) {
      record("metadata", 0, 0, start, { error: error.message });
    }
    await delay(1000);
  }
}
console.log(
  JSON.stringify({ phase: "load", started: Date.now(), saveBytes, rounds, gameBytes: game.size }),
);
const polling = latency();
await Promise.all([saves(), ...(config.download === false ? [] : accounts.map(download))]);
monitoring = false;
await polling;
console.log(JSON.stringify({ phase: "verify", started: Date.now() }));

let verified = 0;
let denied = 0;
for (const account of accounts) {
  const history = await json(
    await privateRequest(account, `/api/profiles/${account.profileId}/revisions`),
  );
  assert.equal(history.length, account.revisions.length);
  assert.deepEqual(
    history.map((revision) => revision.id),
    account.revisions.map((revision) => revision.id).reverse(),
  );
  for (const revision of account.revisions) {
    const path = `/api/revisions/${revision.id}/file?name=CAPACITY.BIN`;
    const response = await privateRequest(account, path);
    assert.equal(response.status, 200);
    const hash = createHash("sha256");
    let size = 0;
    for await (const chunk of response.body) {
      hash.update(chunk);
      size += chunk.length;
    }
    assert.equal(size, revision.size);
    assert.equal(hash.digest("hex"), revision.sha256);
    verified++;
    const other = accounts[(account.index + 1) % accounts.length];
    const forbidden = await privateRequest(other, path);
    assert.equal(forbidden.status, 404);
    await forbidden.arrayBuffer();
    denied++;
  }
}
function summary(op) {
  const rows = events.filter((event) => event.op === op);
  const times = rows.map((event) => event.ms).sort((a, b) => a - b);
  const percentile = (value) => times[Math.max(0, Math.ceil(times.length * value) - 1)] ?? 0;
  return {
    count: rows.length,
    statuses: Object.fromEntries(
      [...new Set(rows.map((event) => event.status))].map((status) => [
        status,
        rows.filter((event) => event.status === status).length,
      ]),
    ),
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: percentile(1),
  };
}
const report = {
  started,
  durationMs: Date.now() - started,
  saveBytes,
  rounds,
  gameBytes: game.size,
  verified,
  denied,
  firstAttemptFailures: events.filter(
    (event) => event.op === "upload" && event.attempt === 1 && event.status !== 201,
  ).length,
  summary: Object.fromEntries(
    ["login", "download", "upload", "sync", "metadata"].map((op) => [op, summary(op)]),
  ),
  events,
};
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, events: undefined }));
if (
  events.some(
    (event) =>
      (["sync", "download"].includes(event.op) && event.status === 0) ||
      (event.op === "metadata" && event.status !== 200),
  )
)
  process.exitCode = 1;
