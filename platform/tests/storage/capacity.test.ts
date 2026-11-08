import { statfs } from "node:fs/promises";
import { beforeEach, expect, it, vi } from "vitest";
import { DiskCapacity, DiskSpaceError } from "../../src/storage/capacity.ts";

vi.mock("node:fs/promises", () => ({ statfs: vi.fn() }));
beforeEach(() => {
  vi.mocked(statfs)
    .mockReset()
    .mockResolvedValue({ bavail: 100n, bsize: 1n } as never);
});

it("keeps concurrent pending writes inside the reserve and releases successful reservations", async () => {
  const capacity = new DiskCapacity(90);
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  let finish!: (value: string) => void;
  const completed = new Promise<string>((resolve) => {
    finish = resolve;
  });
  const first = capacity.write("store", 6, () => {
    signalStarted();
    return completed;
  });
  await started;
  const second = vi.fn();
  await expect(capacity.write("store", 6, second)).rejects.toBeInstanceOf(DiskSpaceError);
  expect(second).not.toHaveBeenCalled();
  finish("saved");
  expect(await first).toBe("saved");
  expect(await capacity.write("store", 10, async () => "retry")).toBe("retry");
});

it("releases reservations on failed disk probes and propagates unexpected failures", async () => {
  const capacity = new DiskCapacity(90);
  vi.mocked(statfs).mockRejectedValueOnce(new Error("probe failed"));
  await expect(capacity.write("store", 10, vi.fn())).rejects.toThrow("probe failed");
  await expect(
    capacity.write("store", 10, async () => {
      throw new Error("write failed");
    }),
  ).rejects.toThrow("write failed");
  expect(await capacity.write("store", 10, async () => true)).toBe(true);
});

it.each(["ENOSPC", "EDQUOT"])("maps late %s failures and permits retry", async (code) => {
  const capacity = new DiskCapacity(90);
  await expect(
    capacity.write("store", 10, async () => {
      throw Object.assign(new Error("private path"), { code });
    }),
  ).rejects.toBeInstanceOf(DiskSpaceError);
  expect(await capacity.write("store", 10, async () => true)).toBe(true);
});

it.each([-1, 0.5, Infinity, NaN])("rejects invalid reserve %s", (value) => {
  expect(() => new DiskCapacity(value)).toThrow("Invalid disk reserve");
});
