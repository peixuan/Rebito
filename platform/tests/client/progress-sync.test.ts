import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { nativeProgressChanged, publishProgress } from "../../client/runtime/progress-sync.ts";
import type { RuntimeProgress } from "../../client/runtime/types.ts";
import type { Revision } from "../../src/storage/revisions.ts";

const progress: RuntimeProgress = {
  kind: "filesystem",
  files: [
    { name: "SAVE.DAT", bytes: Uint8Array.of(1) },
    { name: "slots/index.dat", bytes: Uint8Array.of(2) },
    { name: "__runtime/filesystem.zip", bytes: Uint8Array.of(3) },
  ],
};
const revision: Revision = {
  id: "base",
  profileId: "profile",
  parentId: null,
  source: "game",
  createdAt: new Date(),
  manifest: {
    kind: "filesystem",
    releaseId: "game",
    artifacts: progress.files.map(({ name, bytes }) => ({
      name,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })),
  },
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("ignores archive-only and ordering changes when deciding to autosave", async () => {
  expect(
    await nativeProgressChanged(
      {
        ...progress,
        files: [
          ...progress.files.slice(0, 2).reverse(),
          { name: "__runtime/filesystem.zip", bytes: Uint8Array.of(9) },
        ],
      },
      revision,
    ),
  ).toBe(false);
  expect(await nativeProgressChanged({ kind: "filesystem", files: [] }, null)).toBe(false);
});

test("detects creation, deletion, renames and changes in any native member", async () => {
  expect(await nativeProgressChanged(progress, null)).toBe(true);
  expect(
    await nativeProgressChanged({ ...progress, files: progress.files.slice(1) }, revision),
  ).toBe(true);
  for (const name of ["slots/index.dat", "renamed.dat"])
    expect(
      await nativeProgressChanged(
        { ...progress, files: [...progress.files.slice(0, 1), { name, bytes: Uint8Array.of(9) }] },
        revision,
      ),
    ).toBe(true);
});

test("uploads the complete collection with the original revision guard", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(revision)));
  vi.stubGlobal("fetch", fetch);
  await publishProgress("profile", "game", "base", progress);
  const [url, options] = fetch.mock.calls[0] ?? [];
  expect(url).toBe("/api/profiles/profile/revisions");
  const body = options.body as FormData;
  expect(JSON.parse(String(body.get("metadata")))).toMatchObject({
    baseRevision: "base",
    releaseId: "game",
  });
  expect((body.getAll("file") as File[]).map((file) => file.name)).toEqual(
    progress.files.map((file) => file.name),
  );
});

function failure(status: number, error: string, retryAfter = "1") {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "retry-after": retryAfter },
  });
}

test("automatically retries admission failures with the same captured bytes and base", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(failure(503, "upload_busy", "3"))
    .mockResolvedValueOnce(failure(503, "upload_busy"))
    .mockResolvedValueOnce(new Response(JSON.stringify(revision)));
  vi.stubGlobal("fetch", fetch);
  const saved = publishProgress("profile", "game", "base", progress);
  await vi.advanceTimersByTimeAsync(2999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.runAllTimersAsync();
  expect(await saved).toMatchObject({ id: "base" });
  expect(fetch).toHaveBeenCalledTimes(3);
  const body = fetch.mock.calls[0]?.[1].body as FormData;
  for (const [, options] of fetch.mock.calls) expect(options.body).toBe(body);
  expect(JSON.parse(String(body.get("metadata"))).baseRevision).toBe("base");
  const files = body.getAll("file") as File[];
  for (const [index, file] of files.entries())
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(progress.files[index]?.bytes);
});

test.each([
  [409, "conflict"],
  [401, "unauthorized"],
  [507, "quota_exceeded"],
  [503, "internal_error"],
  [500, "upload_busy"],
])("does not retry status %i / %s", async (status, code) => {
  const fetch = vi.fn().mockResolvedValue(failure(status, code));
  vi.stubGlobal("fetch", fetch);
  await expect(publishProgress("profile", "game", "base", progress)).rejects.toMatchObject({
    status,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("does not retry an uncertain network failure or an invalid response", async () => {
  for (const response of [
    Promise.reject(new TypeError("connection lost")),
    Promise.resolve(new Response("truncated")),
  ]) {
    const fetch = vi.fn().mockReturnValue(response);
    vi.stubGlobal("fetch", fetch);
    await expect(publishProgress("profile", "game", "base", progress)).rejects.toBeInstanceOf(
      Error,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  }
});

test.each(["invalid", "-1", "120"])(
  "bounds retry attempts and waits for Retry-After %s",
  async (header) => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(async () => failure(503, "upload_busy", header));
    vi.stubGlobal("fetch", fetch);
    const saved = expect(
      publishProgress("profile", "game", "base", progress),
    ).rejects.toMatchObject({ status: 503, message: "save_queue_timeout" });
    await vi.runAllTimersAsync();
    await saved;
    expect(fetch).toHaveBeenCalledTimes(header === "120" ? 1 : 5);
  },
);
