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
afterEach(() => vi.unstubAllGlobals());

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
