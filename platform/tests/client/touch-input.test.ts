import { expect, it, vi } from "vitest";
import { TouchInput } from "../../client/runtime/touch-input.ts";

it("shares a direction between contacts and releases every outstanding key once", () => {
  const send = vi.fn();
  const input = new TouchInput([4, 5, 6, 7], [], send);
  input.update(1, [4, 7]);
  input.update(2, [7, 8]);
  input.update(1, [5, 7]);
  input.update(1, null);
  expect(input.held()).toEqual(new Set([7, 8]));
  input.clear();
  input.clear();
  expect(input.tracks(2)).toBe(false);
  expect(send.mock.calls).toEqual([
    [4, true],
    [7, true],
    [8, true],
    [4, false],
    [5, true],
    [5, false],
    [7, false],
    [8, false],
  ]);
});
