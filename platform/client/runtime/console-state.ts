import { MessageError, message } from "../../src/shared/messages.ts";
import type { RuntimeProgress } from "./types.ts";

interface StateDriver {
  pause(): void;
  load(bytes: Uint8Array<ArrayBuffer>): void;
  advance(): Promise<void>;
  capture(): Promise<RuntimeProgress>;
}

/** A queued core load is not an acknowledgement; observe each edited byte afterward. */
export async function restoreEditedState(
  driver: StateDriver,
  previous: RuntimeProgress,
  next: RuntimeProgress,
) {
  const name = "__runtime/state.bin";
  const before = previous.files.find((file) => file.name === name)?.bytes;
  const after = next.files.find((file) => file.name === name)?.bytes;
  if (!before || !after || !before.length || before.length !== after.length)
    throw new MessageError(message("runtime.snapshotMissing"));
  const changed: number[] = [];
  for (let index = 0; index < before.length; index++)
    if (before[index] !== after[index]) changed.push(index);
  if (!changed.length) throw new MessageError(message("editor.noChanges"));
  driver.pause();
  try {
    driver.load(new Uint8Array(after));
    // The pinned cores process queued loads only while their main loop runs.
    await driver.advance();
  } finally {
    driver.pause();
  }
  const applied = await driver.capture();
  const state = applied.files.find((file) => file.name === name)?.bytes;
  if (
    !state ||
    state.length !== after.length ||
    // Scalars are at most four bytes. Word-swapping can spread an unaligned
    // scalar across six bytes; verify its unchanged neighbours as well.
    changed.some((index) => {
      for (
        let offset = Math.max(0, index - 5);
        offset < Math.min(after.length, index + 6);
        offset++
      )
        if (state[offset] !== after[offset]) return true;
      return false;
    }) ||
    applied.files.length !== next.files.length ||
    next.files.some((file) => {
      if (file.name === name) return false;
      const current = applied.files.find((entry) => entry.name === file.name)?.bytes;
      return (
        !current ||
        current.length !== file.bytes.length ||
        current.some((byte, index) => byte !== file.bytes[index])
      );
    })
  )
    throw new MessageError(message("runtime.snapshotEditUnconfirmed"));
}
