import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The caller provisions a disposable account and supplies its credentials on stdin.
const credentials = JSON.parse(readFileSync(0, "utf8"));
const origin = process.env.SMOKE_ORIGIN ?? "http://localhost:3000";
async function request(path, options = {}) {
  return fetch(new URL(path, origin), { signal: AbortSignal.timeout(10_000), ...options });
}
assert.equal((await request("/health/ready")).status, 200);
const notices = await request("/THIRD_PARTY_NOTICES.txt");
assert.equal(notices.status, 200);
assert.ok((await notices.text()).includes("primevue@"));
assert.equal((await (await request("/api/session")).json()).user, null);
const login = await request("/api/auth/sign-in/email", {
  method: "POST",
  headers: { origin, "content-type": "application/json" },
  body: JSON.stringify(credentials),
});
assert.equal(login.status, 200);
const cookies = login.headers.getSetCookie();
assert.ok(cookies.some((value) => /HttpOnly/i.test(value)));
const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
const session = await (await request("/api/session", { headers: { cookie } })).json();
assert.equal(session.user.name, credentials.name);
async function privateRequest(path, options = {}) {
  return request(path, { ...options, headers: { cookie, origin, ...options.headers } });
}
const profiles = await (await privateRequest("/api/profiles")).json();
let profile = profiles.find((entry) => entry.name === "Container persistence");
if (!profile) {
  const games = await (await privateRequest("/api/games")).json();
  const game = games.find((entry) => entry.title === "Container fixture");
  assert.ok(game, "Seed the disposable container game first");
  const created = await privateRequest("/api/profiles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ releaseId: game.id, name: "Container persistence" }),
  });
  assert.equal(created.status, 201);
  profile = await created.json();
  const body = new FormData();
  body.append(
    "metadata",
    JSON.stringify({ releaseId: game.id, kind: "game-save", baseRevision: null }),
  );
  body.append("file", new Blob([Uint8Array.of(0, 1, 127, 255)]), "SAVE.BIN");
  assert.equal(
    (await privateRequest(`/api/profiles/${profile.id}/revisions`, { method: "POST", body }))
      .status,
    201,
  );
}
const history = await (await privateRequest(`/api/profiles/${profile.id}/revisions`)).json();
assert.equal(history.length, 1);
const saved = await privateRequest(`/api/revisions/${history[0].id}/file?name=SAVE.BIN`);
assert.deepEqual(new Uint8Array(await saved.arrayBuffer()), Uint8Array.of(0, 1, 127, 255));
const logout = await request("/api/auth/sign-out", {
  method: "POST",
  headers: { origin, cookie, "content-type": "application/json" },
  body: "{}",
});
assert.equal(logout.status, 200);
assert.equal((await (await request("/api/session", { headers: { cookie } })).json()).user, null);
console.log("Container health, account sessions and persistent save bytes passed.");
