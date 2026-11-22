import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { prepareSnapshotEdit } from "../../client/runtime/snapshot-edit.ts";
import type { RuntimeProgress } from "../../client/runtime/types.ts";
import type { Revision } from "../../src/storage/revisions.ts";

const before = Uint8Array.of(1, 2, 3);
const after = Uint8Array.of(1, 8, 3);
const sram = Uint8Array.of(5, 6);
const runtime = { adapter: "emulatorjs", core: "genesis_plus_gx", version: "pinned" };
function capture(bytes = before): RuntimeProgress {
  return {
    kind: "snapshot",
    runtime,
    files: [
      { name: "save.srm", bytes: sram },
      { name: "__runtime/state.bin", bytes },
    ],
  };
}
function revision(id: string, bytes: Uint8Array<ArrayBuffer>): Revision {
  return {
    id,
    profileId: "profile",
    parentId: id === "before" ? null : "before",
    source: id === "before" ? "game" : "editor",
    createdAt: new Date(),
    manifest: {
      kind: "snapshot",
      runtime,
      releaseId: "game",
      artifacts: capture(bytes).files.map((file) => ({
        name: file.name,
        size: file.bytes.length,
        sha256: createHash("sha256").update(file.bytes).digest("hex"),
      })),
    },
  };
}
function fixture() {
  const access = {
    read: vi.fn().mockResolvedValue(capture()),
    replace: vi.fn().mockResolvedValue(undefined),
  };
  const download = vi.fn().mockImplementation(async () => new Response(after));
  vi.stubGlobal("fetch", download);
  return {
    access,
    download,
    original: revision("before", before),
    edited: revision("after", after),
  };
}
afterEach(() => vi.unstubAllGlobals());

test("checks every paused file and downloads only the state, preserving native SRAM", async () => {
  const { access, download, original, edited } = fixture();
  const apply = await prepareSnapshotEdit(access, original);
  expect(download).not.toHaveBeenCalled();
  await apply(edited);
  expect(download).toHaveBeenCalledExactlyOnceWith(
    "/api/revisions/after/file?name=__runtime%2Fstate.bin",
    { credentials: "same-origin", cache: "no-store" },
  );
  expect(access.replace).toHaveBeenCalledExactlyOnceWith(capture(), capture(after));
});

test("rejects unsynchronized state or SRAM before publication", async () => {
  const { access, download, original } = fixture();
  for (const name of ["save.srm", "__runtime/state.bin"]) {
    access.read.mockResolvedValue({
      ...capture(),
      files: capture().files.map((file) => (file.name === name ? { ...file, bytes: after } : file)),
    });
    await expect(prepareSnapshotEdit(access, original)).rejects.toMatchObject({ status: 422 });
  }
  expect(download).not.toHaveBeenCalled();
  expect(access.replace).not.toHaveBeenCalled();
});

test("rejects invalid snapshot groups or runtime identities before publication", async () => {
  const { access, original } = fixture();
  await expect(
    prepareSnapshotEdit(access, {
      ...original,
      manifest: { ...original.manifest, kind: "game-save" },
    }),
  ).rejects.toThrow("runtime.snapshotMissing");
  expect(access.read).not.toHaveBeenCalled();
  for (const changed of [
    { ...capture(), kind: "filesystem" },
    { ...capture(), runtime: { ...runtime, version: "other" } },
    { ...capture(), files: [] },
    { ...capture(), files: [capture().files[0], capture().files[0]] },
  ]) {
    access.read.mockResolvedValue(changed);
    await expect(prepareSnapshotEdit(access, original)).rejects.toThrow(
      "runtime.editRevisionMismatch",
    );
  }
});

test("rejects another parent, profile, release, runtime, kind or source", async () => {
  const { access, download, original, edited } = fixture();
  const apply = await prepareSnapshotEdit(access, original);
  for (const changed of [
    { ...edited, parentId: "other" },
    { ...edited, profileId: "other" },
    { ...edited, source: "restore" as const },
    { ...edited, manifest: { ...edited.manifest, releaseId: "other" } },
    { ...edited, manifest: { ...edited.manifest, kind: "game-save" as const } },
    { ...edited, manifest: { ...edited.manifest, runtime: { ...runtime, core: "other" } } },
  ])
    await expect(apply(changed)).rejects.toThrow("runtime.editRevisionMismatch");
  expect(download).not.toHaveBeenCalled();
  expect(access.replace).not.toHaveBeenCalled();
});

test("rejects changed companion files, missing files, resized states and empty edits", async () => {
  const { access, download, original, edited } = fixture();
  const apply = await prepareSnapshotEdit(access, original);
  const artifacts = edited.manifest.artifacts;
  for (const changed of [
    [],
    [...artifacts, ...artifacts],
    artifacts.map((file) => ({ ...file, size: file.size + 1 })),
    artifacts.map((file) =>
      file.name === "save.srm" ? { ...file, sha256: "0".repeat(64) } : file,
    ),
  ])
    await expect(
      apply({ ...edited, manifest: { ...edited.manifest, artifacts: changed } }),
    ).rejects.toThrow("runtime.undeclaredChanges");
  await expect(apply({ ...edited, manifest: original.manifest })).rejects.toThrow(
    "editor.noChanges",
  );
  expect(download).not.toHaveBeenCalled();
});

test("keeps the original capture and published revision on download or writeback retry", async () => {
  const { access, download, original, edited } = fixture();
  const apply = await prepareSnapshotEdit(access, original);
  download.mockResolvedValueOnce(new Response(before));
  await expect(apply(edited)).rejects.toThrow("runtime.integrity");
  expect(access.replace).not.toHaveBeenCalled();
  access.replace.mockRejectedValueOnce(new Error("Writeback failed"));
  await expect(apply(edited)).rejects.toThrow("Writeback failed");
  await expect(apply({ ...edited, id: "different" })).rejects.toThrow(
    "runtime.editRevisionMismatch",
  );
  await apply(edited);
  expect(access.read).toHaveBeenCalledTimes(1);
  expect(access.replace).toHaveBeenNthCalledWith(2, capture(), capture(after));
});
