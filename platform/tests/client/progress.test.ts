import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  assertCompatible,
  downloadProgress,
  downloadVerified,
} from "../../client/runtime/progress.ts";
import type { Game } from "../../src/library/catalog.ts";
import type { Revision } from "../../src/storage/revisions.ts";

const bytes = Uint8Array.of(0, 255, 2);
const artifact = {
  name: "folder/save.srm",
  size: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
const runtime = { adapter: "emulatorjs", core: "fceumm", version: "locked" };
const game: Game = {
  id: "nes-test",
  title: "Test",
  system: "nes",
  sha256: "0".repeat(64),
  size: 1,
  saveFiles: [],
};
const revision: Revision = {
  id: "revision",
  profileId: "profile",
  parentId: null,
  source: "game",
  createdAt: new Date(),
  protected: false,
  manifest: { kind: "game-save", releaseId: game.id, artifacts: [artifact] },
};
afterEach(() => vi.unstubAllGlobals());

it("verifies private downloads and preserves collection names", async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response(bytes));
  vi.stubGlobal("fetch", fetch);
  expect(await downloadProgress(revision)).toEqual({
    kind: "game-save",
    files: [{ name: artifact.name, bytes }],
  });
  expect(fetch.mock.calls[0]).toEqual([
    "/api/revisions/revision/file?name=folder%2Fsave.srm",
    { credentials: "same-origin", cache: "no-store" },
  ]);
  expect(
    await downloadProgress({ ...revision, manifest: { ...revision.manifest, runtime } }),
  ).toHaveProperty("runtime", runtime);
});

it("rejects incorrect bytes, lengths and failed authorization", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => new Response(bytes)),
  );
  await expect(downloadVerified("/asset", { ...artifact, sha256: "0".repeat(64) })).rejects.toThrow(
    "runtime.integrity",
  );
  await expect(downloadVerified("/asset", { ...artifact, size: 4 })).rejects.toThrow(
    "runtime.integrity",
  );
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
  await expect(downloadVerified("/asset", artifact)).rejects.toMatchObject({ status: 401 });
});

it("requires the exact game, core and runtime version for snapshots", () => {
  expect(() => assertCompatible(game, revision, runtime)).not.toThrow();
  expect(() => assertCompatible({ ...game, id: "other" }, revision, runtime)).toThrow(
    "runtime.releaseMismatch",
  );
  const snapshot = {
    ...revision,
    manifest: { ...revision.manifest, kind: "snapshot" as const, runtime },
  };
  expect(() => assertCompatible(game, snapshot, runtime)).not.toThrow();
  expect(() =>
    assertCompatible(
      game,
      {
        ...snapshot,
        manifest: { ...snapshot.manifest, runtime: undefined },
      } as unknown as Revision,
      runtime,
    ),
  ).toThrow("runtime.snapshotMismatch");
  for (const key of ["adapter", "core", "version"] as const) {
    expect(() => assertCompatible(game, snapshot, { ...runtime, [key]: "other" })).toThrow(
      "runtime.snapshotMismatch",
    );
  }
});

it("restores native DOS files across an audio-only runtime variant", () => {
  const previous = { adapter: "jsdos", core: "dosbox", version: "previous-audio" };
  const saved: Revision = {
    ...revision,
    manifest: { ...revision.manifest, kind: "filesystem", runtime: previous },
  };
  expect(() =>
    assertCompatible(game, saved, { ...previous, version: "buffered-audio" }),
  ).not.toThrow();
});
