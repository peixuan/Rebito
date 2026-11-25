import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createConsoleStateLoader } from "../../client/runtime/console-state-loader.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function fixture() {
  const files = new Map<string, Uint8Array>();
  const manager = {
    writeFile: vi.fn((path: string, bytes: Uint8Array) => files.set(path, bytes)),
    clearEJSResetTimer: vi.fn(),
    functions: { loadState: vi.fn() },
    FS: {
      unlink: vi.fn((path: string) => {
        if (!files.delete(path)) throw new Error("Missing temporary file");
      }),
    },
  };
  return { manager, files, loader: createConsoleStateLoader(manager) };
}

it("keeps a second queued state past the first load's cleanup deadline", async () => {
  const { manager, files, loader } = fixture();
  loader.load(Uint8Array.of(1));
  await vi.advanceTimersByTimeAsync(4990);
  loader.load(Uint8Array.of(2));
  await vi.advanceTimersByTimeAsync(10);
  expect(files.get("/rebito.state")).toEqual(Uint8Array.of(2));
  expect(manager.FS.unlink).not.toHaveBeenCalled();
  expect(manager.functions.loadState.mock.calls).toEqual([
    ["/rebito.state", 0],
    ["/rebito.state", 0],
  ]);
  expect(manager.clearEJSResetTimer).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(4990);
  expect(files.size).toBe(0);
  expect(manager.FS.unlink).toHaveBeenCalledExactlyOnceWith("/rebito.state");
  expect(vi.getTimerCount()).toBe(0);
});

it("copies queued bytes and isolates cleanup from the wrapper's shared path", async () => {
  const { files, loader } = fixture();
  files.set("/game.state", Uint8Array.of(9));
  const bytes = Uint8Array.of(3);
  loader.load(bytes);
  bytes[0] = 8;
  expect(files.get("/rebito.state")).toEqual(Uint8Array.of(3));
  await vi.advanceTimersByTimeAsync(5000);
  expect([...files]).toEqual([["/game.state", Uint8Array.of(9)]]);
});

it("disposes the pending file and timer and rejects later loads", async () => {
  const { manager, files, loader } = fixture();
  loader.load(Uint8Array.of(1));
  loader.dispose();
  loader.dispose();
  expect(files.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(5000);
  expect(manager.FS.unlink).toHaveBeenCalledTimes(2);
  expect(() => loader.load(Uint8Array.of(2))).toThrow("disposed");
  expect(manager.writeFile).toHaveBeenCalledTimes(1);
});

it("cleans up synchronous load failures without leaving an older timer", async () => {
  for (const step of ["write", "reset", "load"] as const) {
    const { manager, files, loader } = fixture();
    loader.load(Uint8Array.of(1));
    await vi.advanceTimersByTimeAsync(4990);
    const fail = () => {
      throw new Error(`Failed ${step}`);
    };
    if (step === "write") manager.writeFile.mockImplementationOnce(fail);
    if (step === "reset") manager.clearEJSResetTimer.mockImplementationOnce(fail);
    if (step === "load") manager.functions.loadState.mockImplementationOnce(fail);
    expect(() => loader.load(Uint8Array.of(2))).toThrow(`Failed ${step}`);
    expect(files.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    loader.dispose();
  }
});
