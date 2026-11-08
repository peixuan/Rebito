import { MessageError, message } from "../../src/shared/messages.ts";
import type { RuntimeFileAccess, RuntimeReplacement } from "./types.ts";

interface FileSystem {
  list(): Promise<string[]>;
  read(path: string): Promise<Uint8Array<ArrayBuffer>>;
  write(path: string, bytes: Uint8Array<ArrayBuffer>): Promise<void>;
}
const same = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);
const key = (name: string) => name.normalize("NFC").toLowerCase();

/** Live editing only touches declared native saves, never an archive or game asset. */
export function saveFileAccess(allowed: readonly string[], fs: FileSystem): RuntimeFileAccess {
  async function resolve(name: string, available?: string[]) {
    if (!allowed.some((candidate) => key(candidate) === key(name)))
      throw new MessageError(message("runtime.undeclaredFile"));
    const matches = (available ?? (await fs.list())).filter(
      (candidate) => key(candidate) === key(name),
    );
    if (matches.length !== 1) throw new MessageError(message("runtime.ambiguousFile"));
    return matches[0] as string;
  }
  return {
    async read(name) {
      return new Uint8Array(await fs.read(await resolve(name)));
    },
    async replace(files) {
      if (!files.length || new Set(files.map((file) => key(file.name))).size !== files.length)
        throw new MessageError(message("runtime.invalidFileGroup"));
      const available = await fs.list();
      const prepared: RuntimeReplacement[] = [];
      // Validate every member before writing any; the game remains paused throughout.
      for (const file of files) {
        const name = await resolve(file.name, available);
        if (!same(await fs.read(name), file.previous))
          throw new MessageError(message("runtime.writeConflict"));
        prepared.push({
          name,
          previous: new Uint8Array(file.previous),
          bytes: new Uint8Array(file.bytes),
        });
      }
      const attempted: RuntimeReplacement[] = [];
      try {
        for (const file of prepared) {
          attempted.push(file); // Include a write that fails after partially changing the file.
          // Worker transports may transfer (detach) the supplied ArrayBuffer.
          await fs.write(file.name, new Uint8Array(file.bytes));
          if (!same(await fs.read(file.name), file.bytes))
            throw new MessageError(message("runtime.writeVerification"));
        }
      } catch (cause) {
        const failures: unknown[] = [];
        for (const file of attempted.reverse()) {
          try {
            await fs.write(file.name, new Uint8Array(file.previous));
            if (!same(await fs.read(file.name), file.previous))
              throw new MessageError(message("runtime.restoreVerification"));
          } catch (rollback) {
            failures.push(rollback); // Still try to recover the other files.
          }
        }
        if (failures.length) {
          throw new MessageError(message("runtime.restoreFailed"), {
            cause: new AggregateError(failures),
          });
        }
        throw new MessageError(message("runtime.writeRolledBack"), { cause });
      }
    },
  };
}
