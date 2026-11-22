import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { guardConsolePlayback } from "../../client/runtime/console-guard.ts";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(Date.now()), 16),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function fixture() {
  const play = vi.fn();
  const pause = vi.fn();
  const input = vi.fn();
  const emulator = { play, pause, gameManager: { simulateInput: input } };
  return { emulator, play, pause, input, controls: guardConsolePlayback(emulator) };
}

it("rejects wrapper resume while the workspace holds a pause", () => {
  const { emulator, controls, play, pause } = fixture();
  controls.pause();
  emulator.play();
  expect(pause).toHaveBeenCalledExactlyOnceWith(true);
  expect(play).not.toHaveBeenCalled();
  controls.resume();
  expect(play).toHaveBeenCalledExactlyOnceWith(true);
  emulator.play();
  expect(play).toHaveBeenCalledTimes(2);
});

it("advances only two animation frames and retains the host pause afterward", async () => {
  const { emulator, controls, play, pause } = fixture();
  controls.pause();
  const advance = controls.advance();
  emulator.play();
  expect(play).toHaveBeenCalledExactlyOnceWith(true);
  await vi.advanceTimersByTimeAsync(31);
  expect(pause).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await advance;
  expect(pause).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
  emulator.play();
  expect(play).toHaveBeenCalledTimes(1);
});

it("pauses on frame timeout and late callbacks cannot resume the game", async () => {
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    callbacks.push(callback),
  );
  const { emulator, controls, play, pause } = fixture();
  const failed = expect(controls.advance()).rejects.toThrow("runtime.snapshotEditUnconfirmed");
  await vi.advanceTimersByTimeAsync(2000);
  await failed;
  expect(pause).toHaveBeenCalledExactlyOnceWith(true);
  callbacks.shift()?.(0);
  callbacks.shift()?.(0);
  emulator.play();
  expect(play).toHaveBeenCalledTimes(1);
});

it("keeps the host pause if the underlying resume throws", async () => {
  const { emulator, controls, play, pause } = fixture();
  play.mockImplementationOnce(() => {
    throw new Error("Core failed");
  });
  await expect(controls.advance()).rejects.toThrow("Core failed");
  expect(pause).toHaveBeenCalledExactlyOnceWith(true);
  expect(vi.getTimerCount()).toBe(0);
  emulator.play();
  expect(play).toHaveBeenCalledTimes(1);
});

it("blocks local save/load shortcuts while forwarding normal press and release", () => {
  const { emulator, controls, input } = fixture();
  for (const index of [24, 25]) {
    emulator.gameManager.simulateInput(0, index, 1);
    emulator.gameManager.simulateInput(0, index, 0);
  }
  controls.pause();
  emulator.gameManager.simulateInput(0, 3, 1);
  emulator.gameManager.simulateInput(0, 3, 0);
  expect(input.mock.calls).toEqual([
    [0, 3, 1],
    [0, 3, 0],
  ]);
});
