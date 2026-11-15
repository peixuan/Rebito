import { afterEach, expect, test, vi } from "vitest";
import { UploadBusyError, UploadQueue } from "../../src/saves/upload-queue.ts";
import { deferred } from "../deferred.ts";

const signal = () => new AbortController().signal;
afterEach(() => vi.useRealTimers());

test("admits five simultaneous saves FIFO with at most two active bodies", async () => {
  const queue = new UploadQueue();
  const gates = Array.from({ length: 5 }, deferred);
  const started: number[] = [];
  const tasks = gates.map((gate, index) =>
    queue.run(signal(), async () => {
      started.push(index);
      await gate.promise;
      return index;
    }),
  );
  await vi.waitFor(() => expect(started).toEqual([0, 1]));
  gates[1]?.resolve();
  await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
  gates[0]?.resolve();
  await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3]));
  gates[2]?.resolve();
  await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3, 4]));
  for (const gate of gates) gate.resolve();
  expect(await Promise.all(tasks)).toEqual([0, 1, 2, 3, 4]);
});

test("rejects overflow and expired waiters without running their actions", async () => {
  vi.useFakeTimers();
  const queue = new UploadQueue(1, 1, 100);
  const gate = deferred();
  const active = queue.run(signal(), () => gate.promise);
  const action = vi.fn();
  const waiting = expect(queue.run(signal(), action)).rejects.toBeInstanceOf(UploadBusyError);
  await expect(queue.run(signal(), action)).rejects.toBeInstanceOf(UploadBusyError);
  await vi.advanceTimersByTimeAsync(100);
  await waiting;
  gate.resolve();
  await active;
  expect(action).not.toHaveBeenCalled();
  expect(await queue.run(signal(), async () => "next")).toBe("next");
});

test("removes disconnected waiters but holds an active slot until publication settles", async () => {
  const queue = new UploadQueue(1);
  const gate = deferred();
  const first = new AbortController();
  const active = queue.run(first.signal, () => gate.promise);
  await Promise.resolve();
  first.abort();
  const second = new AbortController();
  const action = vi.fn();
  const cancelled = expect(queue.run(second.signal, action)).rejects.toMatchObject({
    name: "AbortError",
  });
  second.abort();
  await cancelled;
  const next = queue.run(signal(), action);
  await Promise.resolve();
  expect(action).not.toHaveBeenCalled();
  gate.resolve();
  await Promise.all([active, next]);
  expect(action).toHaveBeenCalledTimes(1);
});

test("releases slots on failed writes and aborts immediately before action entry", async () => {
  const queue = new UploadQueue(1);
  await expect(
    queue.run(signal(), async () => {
      throw new Error("write failed");
    }),
  ).rejects.toThrow("write failed");
  const controller = new AbortController();
  const action = vi.fn();
  const cancelled = queue.run(controller.signal, action);
  controller.abort();
  await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
  await expect(queue.run(controller.signal, action)).rejects.toMatchObject({ name: "AbortError" });
  expect(action).not.toHaveBeenCalled();
  expect(await queue.run(signal(), async () => "recovered")).toBe("recovered");
});
