import { expect, it, vi } from "vitest";
import { withRuntimeKeyboard } from "../../client/runtime/keyboard.ts";
import type { RuntimeHandle } from "../../client/runtime/types.ts";

it("retains keyboard handling when stopping fails and removes it after a successful retry", async () => {
  const canvas = {
    getAttribute: vi.fn(() => "-1"),
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    focus: vi.fn(),
    tabIndex: -1,
  };
  const element = {
    querySelector: vi.fn(() => canvas),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const stop = vi.fn().mockRejectedValueOnce(new Error("stop failed")).mockResolvedValue(undefined);
  const original: RuntimeHandle = {
    stop,
    pause: vi.fn(),
    resume: vi.fn(),
    capture: vi.fn().mockResolvedValue(null),
  };
  const handle = withRuntimeKeyboard(element as unknown as HTMLElement, original);
  expect(canvas.focus).not.toHaveBeenCalled();
  handle.resume();
  expect(original.resume).toHaveBeenCalledOnce();
  expect(canvas.focus).not.toHaveBeenCalled();
  handle.focus?.();
  expect(canvas.focus).toHaveBeenCalledWith({ preventScroll: true });
  await expect(handle.stop()).rejects.toThrow("stop failed");
  expect(element.removeEventListener).not.toHaveBeenCalled();
  expect(canvas.removeEventListener).not.toHaveBeenCalled();
  await handle.stop();
  expect(element.removeEventListener).toHaveBeenCalledTimes(2);
  expect(canvas.removeEventListener).toHaveBeenCalledOnce();
  expect(canvas.setAttribute).toHaveBeenCalledWith("tabindex", "-1");
});
