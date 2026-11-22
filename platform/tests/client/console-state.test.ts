import { expect, it, vi } from "vitest";
import { restoreEditedState } from "../../client/runtime/console-state.ts";
import type { RuntimeProgress } from "../../client/runtime/types.ts";

function progress(bytes: number[]): RuntimeProgress {
  return {
    kind: "snapshot",
    files: [
      { name: "__runtime/state.bin", bytes: new Uint8Array(bytes) },
      { name: "save.srm", bytes: Uint8Array.of(7) },
    ],
  };
}
const originalBytes = Array<number>(32).fill(0);
originalBytes[16] = 2;
const editedBytes = [...originalBytes];
editedBytes[16] = 8;
const before = progress(originalBytes);
const after = progress(editedBytes);
function driver() {
  return {
    pause: vi.fn(),
    load: vi.fn(),
    advance: vi.fn().mockResolvedValue(undefined),
    capture: vi
      .fn()
      .mockResolvedValue(
        progress(editedBytes.map((value, index) => (index === 0 || index === 31 ? 9 : value))),
      ),
  };
}

it("confirms edited bytes after advancing the queued load and pauses before capture", async () => {
  const core = driver();
  await restoreEditedState(core, before, after);
  expect(core.load).toHaveBeenCalledExactlyOnceWith(new Uint8Array(editedBytes));
  expect(core.pause).toHaveBeenCalledTimes(2);
  expect(core.pause.mock.invocationCallOrder[1]).toBeLessThan(
    core.capture.mock.invocationCallOrder[0] ?? 0,
  );
});

it("leaves the runtime paused when loading or advancing fails", async () => {
  for (const failure of ["load", "advance"] as const) {
    const core = driver();
    core[failure].mockImplementation(() => {
      throw new Error("core failed");
    });
    await expect(restoreEditedState(core, before, after)).rejects.toThrow("core failed");
    expect(core.pause).toHaveBeenCalledTimes(2);
    expect(core.capture).not.toHaveBeenCalled();
  }
});

it("does not acknowledge an ignored load, a changed native save or mismatched capture", async () => {
  const core = driver();
  for (const applied of [
    before,
    progress([1, 8]),
    { ...after, files: [] },
    {
      ...after,
      files: after.files.map((file) =>
        file.name === "save.srm" ? { ...file, bytes: Uint8Array.of(9) } : file,
      ),
    },
    { ...after, files: [...after.files, { name: "extra", bytes: Uint8Array.of(1) }] },
  ]) {
    core.capture.mockResolvedValue(applied);
    await expect(restoreEditedState(core, before, after)).rejects.toThrow(
      "runtime.snapshotEditUnconfirmed",
    );
  }
});

it("rejects empty, missing or resized edits before changing the core", async () => {
  const core = driver();
  for (const changed of [before, progress([]), progress([1, 8]), { ...after, files: [] }])
    await expect(restoreEditedState(core, before, changed)).rejects.toThrow();
  expect(core.load).not.toHaveBeenCalled();
  expect(core.advance).not.toHaveBeenCalled();
});

it("rejects drift in an unchanged high byte of an edited multi-byte value", async () => {
  const core = driver();
  for (const offset of [11, 14, 17, 21]) {
    const drifted = [...editedBytes];
    drifted[offset] = 1;
    core.capture.mockResolvedValue(progress(drifted));
    await expect(restoreEditedState(core, before, after)).rejects.toThrow(
      "runtime.snapshotEditUnconfirmed",
    );
  }
});
