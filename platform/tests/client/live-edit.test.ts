import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { prepareLiveEdit } from "../../client/runtime/live-edit.ts";
import type { Revision } from "../../src/storage/revisions.ts";

const before = Uint8Array.of(1, 2);
const after = Uint8Array.of(3, 4);
function revision(id: string, bytes: Uint8Array): Revision {
  return {
    id,
    profileId: "profile",
    parentId: id === "before" ? null : "before",
    source: id === "before" ? "game" : "editor",
    createdAt: new Date(),
    manifest: {
      kind: "filesystem",
      releaseId: "game",
      artifacts: [
        {
          name: "SAVE.DAT",
          size: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      ],
    },
  };
}
function fixture() {
  const files = {
    read: vi.fn().mockResolvedValue(before),
    replace: vi.fn().mockResolvedValue(undefined),
  };
  const download = vi.fn().mockImplementation(async () => new Response(after));
  vi.stubGlobal("fetch", download);
  return {
    files,
    download,
    original: revision("before", before),
    edited: revision("after", after),
  };
}
afterEach(() => vi.unstubAllGlobals());

test("downloads only the edited file and retains previous bytes for guarded replacement", async () => {
  const { files, download, original, edited } = fixture();
  const apply = await prepareLiveEdit(files, original, "SAVE.DAT");
  expect(download).not.toHaveBeenCalled();
  await apply(edited);
  expect(download).toHaveBeenCalledTimes(1);
  expect(download.mock.calls[0]?.[0]).toBe("/api/revisions/after/file?name=SAVE.DAT");
  expect(files.replace).toHaveBeenCalledWith("SAVE.DAT", before, after);
});

test("rejects missing or unsynchronized local files before publication", async () => {
  const { files, download, original } = fixture();
  await expect(prepareLiveEdit(files, original, "OTHER.DAT")).rejects.toThrow(
    "runtime.baseFileMissing",
  );
  expect(files.read).not.toHaveBeenCalled();
  files.read.mockResolvedValue(after);
  await expect(prepareLiveEdit(files, original, "SAVE.DAT")).rejects.toMatchObject({ status: 422 });
  expect(download).not.toHaveBeenCalled();
  expect(files.replace).not.toHaveBeenCalled();
});

test("rejects another parent, profile, game or publication source without writing", async () => {
  const { files, download, original, edited } = fixture();
  const apply = await prepareLiveEdit(files, original, "SAVE.DAT");
  for (const changed of [
    { ...edited, parentId: "other" },
    { ...edited, profileId: "other" },
    { ...edited, manifest: { ...edited.manifest, releaseId: "other" } },
    { ...edited, source: "restore" as const },
  ])
    await expect(apply(changed)).rejects.toThrow("runtime.editRevisionMismatch");
  await expect(
    apply({ ...edited, manifest: { ...edited.manifest, artifacts: [] } }),
  ).rejects.toThrow("runtime.editedFileMissing");
  expect(download).not.toHaveBeenCalled();
  expect(files.replace).not.toHaveBeenCalled();
});

test("does not write corrupt downloads and allows a later verified retry", async () => {
  const { files, download, original, edited } = fixture();
  const apply = await prepareLiveEdit(files, original, "SAVE.DAT");
  download.mockResolvedValueOnce(new Response(before));
  await expect(apply(edited)).rejects.toThrow("runtime.integrity");
  expect(files.replace).not.toHaveBeenCalled();
  await apply(edited);
  expect(files.replace).toHaveBeenCalledExactlyOnceWith("SAVE.DAT", before, after);
});
