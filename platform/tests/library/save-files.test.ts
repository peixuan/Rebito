import { expect, test, vi } from "vitest";
import { saveFileAccess } from "../../client/runtime/save-files.ts";

function fixture() {
  const original = Uint8Array.of(1, 2, 3);
  const disk = new Map([
    ["Save.DAT", original],
    ["OTHER.DAT", Uint8Array.of(9)],
  ]);
  const write = vi.fn(async (path: string, bytes: Uint8Array<ArrayBuffer>) => {
    disk.set(path, new Uint8Array(bytes));
  });
  const access = saveFileAccess(["SAVE.DAT"], {
    list: async () => [...disk.keys()],
    read: async (path) => disk.get(path) as Uint8Array<ArrayBuffer>,
    write,
  });
  return { access, original, disk, write };
}

test("replaces one declared save using its real case and preserves other files", async () => {
  const { access, original, disk, write } = fixture();
  const before = await access.read("save.dat");
  before[0] = 0;
  expect(disk.get("Save.DAT")).toEqual(original);
  await access.replace("SAVE.DAT", original, Uint8Array.of(4, 5));
  expect(write).toHaveBeenCalledWith("Save.DAT", Uint8Array.of(4, 5));
  expect(disk.get("OTHER.DAT")).toEqual(Uint8Array.of(9));
});

test("rejects undeclared paths, runtime archives and ambiguous names before writing", async () => {
  const { access, original, disk, write } = fixture();
  for (const name of ["OTHER.DAT", "../Save.DAT", "__runtime/filesystem.zip"])
    await expect(access.replace(name, original, original)).rejects.toThrow(
      "runtime.undeclaredFile",
    );
  disk.set("SAVE.DAT", original);
  await expect(access.replace("SAVE.DAT", original, original)).rejects.toThrow(
    "runtime.ambiguousFile",
  );
  disk.delete("SAVE.DAT");
  disk.delete("Save.DAT");
  await expect(access.read("SAVE.DAT")).rejects.toThrow("runtime.ambiguousFile");
  expect(write).not.toHaveBeenCalled();
});

test("does not overwrite a newer game-side write", async () => {
  const { access, original, disk, write } = fixture();
  disk.set("Save.DAT", Uint8Array.of(7));
  await expect(access.replace("SAVE.DAT", original, Uint8Array.of(8))).rejects.toThrow(
    "runtime.writeConflict",
  );
  expect(write).not.toHaveBeenCalled();
  expect(disk.get("Save.DAT")).toEqual(Uint8Array.of(7));
});

test("retains verification and backup bytes when the worker transfers its input buffer", async () => {
  const { access, original, disk, write } = fixture();
  write.mockImplementation(async (path, bytes) => {
    disk.set(path, structuredClone(bytes, { transfer: [bytes.buffer] }));
  });
  const replacement = Uint8Array.of(4, 5);
  await access.replace("SAVE.DAT", original, replacement);
  expect(replacement).toEqual(Uint8Array.of(4, 5));
  expect(original).toEqual(Uint8Array.of(1, 2, 3));
  expect(disk.get("Save.DAT")).toEqual(replacement);
});

test.each(["partial failure", "silent corruption"])("rolls back %s", async (failure) => {
  const { access, original, disk, write } = fixture();
  write.mockImplementationOnce(async (path) => {
    disk.set(path, Uint8Array.of(0));
    if (failure === "partial failure") throw new Error("I/O unavailable");
  });
  await expect(access.replace("SAVE.DAT", original, Uint8Array.of(8))).rejects.toThrow(
    "runtime.writebackRolledBack",
  );
  expect(disk.get("Save.DAT")).toEqual(original);
  expect(disk.get("OTHER.DAT")).toEqual(Uint8Array.of(9));
});

test("reports an unverified rollback instead of claiming the file is restored", async () => {
  const { access, original, write } = fixture();
  write.mockRejectedValue(new Error("I/O unavailable"));
  await expect(access.replace("SAVE.DAT", original, Uint8Array.of(8))).rejects.toThrow(
    "runtime.restoreFailed",
  );
});
