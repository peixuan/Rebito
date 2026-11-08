import { MessageError, message } from "../../src/shared/messages.ts";
import type { RuntimeFileAccess } from "./types.ts";

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
  async function resolve(name: string) {
    if (!allowed.some((candidate) => key(candidate) === key(name)))
      throw new MessageError(message("runtime.undeclaredFile"));
    const matches = (await fs.list()).filter((candidate) => key(candidate) === key(name));
    if (matches.length !== 1) throw new MessageError(message("runtime.ambiguousFile"));
    return matches[0] as string;
  }
  return {
    async read(name) {
      return new Uint8Array(await fs.read(await resolve(name)));
    },
    async replace(name, previous, bytes) {
      const path = await resolve(name);
      if (!same(await fs.read(path), previous))
        throw new MessageError(message("runtime.writeConflict"));
      try {
        // Worker transports may transfer (detach) the supplied ArrayBuffer.
        await fs.write(path, new Uint8Array(bytes));
        if (!same(await fs.read(path), bytes))
          throw new MessageError(message("runtime.writeVerification"));
      } catch (cause) {
        try {
          await fs.write(path, new Uint8Array(previous));
          if (!same(await fs.read(path), previous))
            throw new MessageError(message("runtime.restoreVerification"));
        } catch (rollback) {
          throw new MessageError(message("runtime.restoreFailed"), {
            cause: rollback,
          });
        }
        throw new MessageError(message("runtime.writebackRolledBack"), { cause });
      }
    },
  };
}
