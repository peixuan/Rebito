export interface ConsoleStateManager {
  writeFile(path: string, bytes: Uint8Array): void;
  clearEJSResetTimer(): void;
  functions: { loadState(path: string, slot: number): void };
  FS: { unlink(path: string): void };
}

export interface ConsoleStateLoader {
  load(bytes: Uint8Array): void;
  dispose(): void;
}

/** Own the queued load file so an older wrapper timer cannot delete a newer state. */
export function createConsoleStateLoader(manager: ConsoleStateManager): ConsoleStateLoader {
  const path = "/rebito.state";
  let cleanup: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  function remove() {
    try {
      manager.FS.unlink(path);
    } catch {
      // A failed write or an earlier cleanup may have left no temporary file.
    }
  }
  function cancelCleanup() {
    clearTimeout(cleanup);
    cleanup = undefined;
  }
  return {
    load(bytes: Uint8Array) {
      if (disposed) throw new Error("Console state loader is disposed");
      cancelCleanup();
      try {
        manager.writeFile(path, new Uint8Array(bytes));
        manager.clearEJSResetTimer();
        manager.functions.loadState(path, 0);
      } catch (error) {
        remove();
        throw error;
      }
      cleanup = setTimeout(() => {
        cleanup = undefined;
        remove();
      }, 5000);
    },
    dispose() {
      disposed = true;
      cancelCleanup();
      remove();
    },
  };
}
