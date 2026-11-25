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
    protected: false,
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
  const apply = await prepareLiveEdit(files, original, ["SAVE.DAT"]);
  expect(download).not.toHaveBeenCalled();
  await apply(edited);
  expect(download).toHaveBeenCalledTimes(1);
  expect(download.mock.calls[0]?.[0]).toBe("/api/revisions/after/file?name=SAVE.DAT");
  expect(files.replace).toHaveBeenCalledWith([
    { name: "SAVE.DAT", previous: before, bytes: after },
  ]);
});

test("rejects missing or unsynchronized local files before publication", async () => {
  const { files, download, original } = fixture();
  await expect(prepareLiveEdit(files, original, ["OTHER.DAT"])).rejects.toThrow(
    "runtime.baseFileMissing",
  );
  expect(files.read).not.toHaveBeenCalled();
  files.read.mockResolvedValue(after);
  await expect(prepareLiveEdit(files, original, ["SAVE.DAT"])).rejects.toMatchObject({
    status: 422,
  });
  expect(download).not.toHaveBeenCalled();
  expect(files.replace).not.toHaveBeenCalled();
});

test("guards an unchanged companion and retains it during verified writeback", async () => {
  const { files, download, original, edited } = fixture();
  const source = original.manifest.artifacts[0];
  if (!source) throw new Error("Missing fixture artifact");
  const companion = { ...source, name: "INDEX.DAT" };
  const addCompanion = (value: Revision): Revision => ({
    ...value,
    manifest: { ...value.manifest, artifacts: [...value.manifest.artifacts, companion] },
  });
  const base = addCompanion(original);
  const next = addCompanion(edited);
  const group = ["SAVE.DAT", "INDEX.DAT"];
  files.read.mockImplementation(async (name) => (name === "INDEX.DAT" ? after : before));
  await expect(prepareLiveEdit(files, base, group)).rejects.toMatchObject({ status: 422 });
  expect(download).not.toHaveBeenCalled();
  expect(files.replace).not.toHaveBeenCalled();
  files.read.mockResolvedValue(before);
  const apply = await prepareLiveEdit(files, base, group);
  download.mockResolvedValueOnce(new Response(after)).mockResolvedValueOnce(new Response(before));
  await apply(next);
  expect(files.replace).toHaveBeenCalledExactlyOnceWith([
    { name: "SAVE.DAT", previous: before, bytes: after },
    { name: "INDEX.DAT", previous: before, bytes: before },
  ]);
});

test("rejects another parent, profile, game or publication source without writing", async () => {
  const { files, download, original, edited } = fixture();
  const apply = await prepareLiveEdit(files, original, ["SAVE.DAT"]);
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
  const apply = await prepareLiveEdit(files, original, ["SAVE.DAT"]);
  download.mockResolvedValueOnce(new Response(before));
  await expect(apply(edited)).rejects.toThrow("runtime.integrity");
  expect(files.replace).not.toHaveBeenCalled();
  await apply(edited);
  expect(files.replace).toHaveBeenCalledExactlyOnceWith([
    { name: "SAVE.DAT", previous: before, bytes: after },
  ]);
});

test("verifies all downloads before replacing a group and rejects undeclared changes", async () => {
  const { files, download, original, edited } = fixture();
  const addSecond = (value: Revision): Revision => ({
    ...value,
    manifest: {
      ...value.manifest,
      artifacts: [
        ...value.manifest.artifacts.flatMap((file) => [file, { ...file, name: "slots/index.dat" }]),
      ],
    },
  });
  const base = addSecond(original);
  const next = addSecond(edited);
  await expect(prepareLiveEdit(files, base, [])).rejects.toThrow("runtime.invalidFileGroup");
  await expect(prepareLiveEdit(files, base, ["SAVE.DAT", "save.dat"])).rejects.toThrow(
    "runtime.invalidFileGroup",
  );
  const single = await prepareLiveEdit(files, base, ["SAVE.DAT"]);
  await expect(single(next)).rejects.toThrow("runtime.undeclaredChanges");
  await expect(
    single({
      ...edited,
      manifest: {
        ...edited.manifest,
        artifacts: [
          ...base.manifest.artifacts,
          ...base.manifest.artifacts.slice(0, 1).map((file) => ({ ...file, name: "extra" })),
        ],
      },
    }),
  ).rejects.toThrow("runtime.undeclaredChanges");
  const apply = await prepareLiveEdit(files, base, ["SAVE.DAT", "slots/index.dat"]);
  download.mockResolvedValueOnce(new Response(after)).mockResolvedValueOnce(new Response(before));
  await expect(apply(next)).rejects.toThrow("runtime.integrity");
  expect(files.replace).not.toHaveBeenCalled();
  await apply(next);
  expect(files.replace).toHaveBeenCalledExactlyOnceWith([
    { name: "SAVE.DAT", previous: before, bytes: after },
    { name: "slots/index.dat", previous: before, bytes: after },
  ]);
});
