import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createPlatform } from "../../src/server/platform.ts";
import * as reclamation from "../../src/storage/history-reclamation.ts";
import type { Revision } from "../../src/storage/revisions.ts";
import { seedLibrary } from "../library/fixture.ts";
import { historyFixture } from "../storage/history-fixture.ts";

let fixture: Awaited<ReturnType<typeof historyFixture>>;
let app: Awaited<ReturnType<typeof createPlatform>>;
let owner: string;
let cookie: string;
let other: string;
const origin = "http://localhost:3000";
beforeAll(async () => {
  fixture = await historyFixture();
  await seedLibrary(fixture.directory);
  app = await createPlatform(fixture.config, fixture.database);
  for (const name of ["player", "second"]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin },
      payload: { email: `${name}@example.test`, name, password: "history-test-password" },
    });
    expect(response.statusCode).toBe(200);
    const value = response.cookies.map((entry) => `${entry.name}=${entry.value}`).join("; ");
    if (name === "player") {
      owner = response.json().user.id;
      cookie = value;
    } else other = value;
  }
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
});
async function history() {
  const profile = await fixture.repository.create(owner, "test-game", "History API");
  const revisions: Revision[] = [];
  for (let index = 0; index < 7; index++)
    revisions.push(await fixture.append(profile.id, revisions.at(-1)?.id ?? null, index, owner));
  return { profile, revisions, path: `/api/profiles/${profile.id}/history` };
}
const preview = (path: string) => app.inject({ url: `${path}/preview`, headers: { cookie } });
const cleanup = (path: string, token: string) =>
  app.inject({
    method: "POST",
    url: `${path}/cleanup`,
    headers: { origin, cookie },
    payload: { token },
  });

it("previews and confirms owned history without deleting heads or protected points", async () => {
  const { profile, revisions, path } = await history();
  const first = revisions[0];
  if (!first) throw new Error("Missing history");
  await fixture.repository.protect(owner, first.id, false, true);
  expect((await app.inject(`${path}/preview`)).statusCode).toBe(401);
  expect(
    (await app.inject({ url: `${path}/preview`, headers: { cookie: other } })).statusCode,
  ).toBe(404);
  const planned = await preview(path);
  expect(planned.statusCode).toBe(200);
  expect(planned.json()).toMatchObject({
    logicalBytes: 4,
    reclaimableBytes: 4,
    protectedRevisions: 1,
  });
  expect((await cleanup(path, "invalid")).statusCode).toBe(400);
  expect(
    (
      await app.inject({
        method: "POST",
        url: `${path}/cleanup`,
        headers: { cookie: other, origin },
        payload: { token: planned.json().token },
      })
    ).statusCode,
  ).toBe(404);
  const result = await cleanup(path, planned.json().token);
  expect(result.statusCode).toBe(200);
  expect(result.json()).toMatchObject({ reclaimedBytes: 4, pendingFiles: 0 });
  expect(
    (await fixture.repository.list(owner)).find((entry) => entry.id === profile.id)?.headId,
  ).toBe(revisions.at(-1)?.id);
  expect(await fixture.repository.history(owner, profile.id)).toHaveLength(3);
  expect(await fixture.service.file(owner, first.id, "save.dat")).toEqual(Buffer.from([0]));
  expect((await cleanup(path, planned.json().token)).statusCode).toBe(409);
});

it("returns durable pending cleanup after a disk failure and retries files only", async () => {
  const { profile, path } = await history();
  const planned = (await preview(path)).json();
  const reclaim = reclamation.reclaimHistory;
  const fail = vi
    .spyOn(reclamation, "reclaimHistory")
    .mockImplementation(async (database, directory, selectedOwner, remove) => {
      if (selectedOwner === owner) throw new Error("disk failure");
      return reclaim(database, directory, selectedOwner, remove);
    });
  try {
    const result = await cleanup(path, planned.token);
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ reclaimedBytes: null, pendingFiles: 5 });
  } finally {
    fail.mockRestore();
  }
  const historyBefore = await fixture.repository.history(owner, profile.id);
  expect(historyBefore).toHaveLength(2);
  const retried = await app.inject({
    method: "POST",
    url: "/api/storage/reclaim",
    headers: { origin, cookie },
    payload: {},
  });
  expect(retried.statusCode).toBe(200);
  expect(retried.json().pendingFiles).toBe(0);
  expect(await fixture.repository.history(owner, profile.id)).toEqual(historyBefore);
});

it("automatically rotates successful HTTP saves while preserving an explicitly protected point", async () => {
  const profile = await fixture.repository.create(owner, "test-game", "Automatic HTTP rotation");
  let base: string | null = null;
  let protectedId = "";
  for (let index = 0; index < 14; index++) {
    const body = new FormData();
    body.append(
      "metadata",
      JSON.stringify({ kind: "game-save", releaseId: "test-game", baseRevision: base }),
    );
    body.append("file", new Blob([Uint8Array.of(index + 50)]), "save.dat");
    const encoded = new Request(origin, { method: "POST", body });
    const response = await app.inject({
      method: "POST",
      url: `/api/profiles/${profile.id}/revisions`,
      headers: { cookie, origin, "content-type": encoded.headers.get("content-type") ?? "" },
      payload: Buffer.from(await encoded.arrayBuffer()),
    });
    expect(response.statusCode).toBe(201);
    base = response.json().id;
    if (index === 0 && base) {
      protectedId = base;
      const protectedPoint = await app.inject({
        method: "POST",
        url: `/api/revisions/${base}/protection`,
        headers: { cookie, origin },
        payload: { expected: false, protected: true },
      });
      expect(protectedPoint.statusCode).toBe(200);
    }
  }
  await vi.waitFor(async () =>
    expect(await fixture.repository.history(owner, profile.id)).toHaveLength(11),
  );
  expect(
    (await fixture.repository.list(owner)).find((entry) => entry.id === profile.id)?.headId,
  ).toBe(base);
  expect(await fixture.service.file(owner, protectedId, "save.dat")).toEqual(Buffer.from([50]));
  if (!base) throw new Error("Missing head");
  expect(await fixture.service.file(owner, base, "save.dat")).toEqual(Buffer.from([63]));
});

it("lets only the owner delete damaged progress after reviewing its protected history", async () => {
  const profile = await fixture.repository.create(owner, "test-game", "Broken save");
  const head = await fixture.append(profile.id, null, 183, owner);
  const [file] = head.manifest.artifacts;
  if (!file) throw new Error("Missing test artifact");
  await unlink(join(fixture.directory, "blobs", file.sha256));
  const url = `/api/profiles/${profile.id}/deletion`;
  const review = () => app.inject({ url, headers: { cookie } });
  const confirm = (token: string, session = cookie, source = origin) =>
    app.inject({
      method: "POST",
      url,
      headers: { cookie: session, origin: source },
      payload: { token },
    });
  expect((await app.inject(url)).statusCode).toBe(401);
  const planned = (await review()).json();
  expect((await confirm(planned.token, other)).statusCode).toBe(404);
  expect((await confirm(planned.token, cookie, "https://other.example")).statusCode).toBe(403);
  expect((await confirm("bad")).statusCode).toBe(400);
  await fixture.repository.protect(owner, head.id, false, true);
  expect((await confirm(planned.token)).statusCode).toBe(409);
  const updated = (await review()).json();
  expect(updated).toMatchObject({ protectedRevisions: 1, revisions: 1 });
  expect((await confirm(updated.token)).statusCode).toBe(200);
  expect((await review()).statusCode).toBe(404);
});
