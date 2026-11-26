import { MessageError, message } from "../../src/shared/messages.ts";
import { loadScript, loadStyle } from "./assets.ts";
import { type ConsoleControls, consoleControls } from "./console-controls.ts";
import { guardConsolePlayback } from "./console-guard.ts";
import { consoleLocale } from "./console-locale.ts";
import { restoreEditedState } from "./console-state.ts";
import {
  type ConsoleStateLoader,
  type ConsoleStateManager,
  createConsoleStateLoader,
} from "./console-state-loader.ts";
import { consoleSystems } from "./console-systems.ts";
import { runtimeIdentity } from "./identity.ts";
import { TouchInput } from "./touch-input.ts";
import type { RuntimeFile, RuntimeHandle, RuntimeLaunch, RuntimeProgress } from "./types.ts";

interface Emulator extends ConsoleControls {
  menu: { close(): void };
  pause(dontUpdate?: boolean): void;
  play(dontUpdate?: boolean): void;
  on(event: string, callback: () => void): void;
  gameManager: ConsoleStateManager & {
    FS: {
      filesystems: { MEMFS: unknown };
      mount(type: unknown, options: object, path: string): void;
      unmount(path: string): void;
    };
    getState(): Uint8Array;
    loadSaveFiles(): void;
    restart(): void;
    setVariable(name: string, value: string): void;
    getSaveFile(): Uint8Array | null;
    getSaveFilePath(): string;
    supportsStates(): boolean;
    simulateInput(player: number, index: number, value: number): void;
  };
}

export async function startConsole(launch: RuntimeLaunch): Promise<RuntimeHandle> {
  if (launch.game.system === "dos") throw new MessageError(message("runtime.dosRequired"));
  const system = consoleSystems[launch.game.system];
  const disc = launch.game.system === "segacd";
  const runtime = runtimeIdentity(launch.game.system);
  const urls: string[] = [];
  function url(bytes: Uint8Array<ArrayBuffer>) {
    const value = URL.createObjectURL(new Blob([bytes]));
    urls.push(value);
    return value;
  }
  const progress = launch.progress;
  if (progress?.kind === "filesystem") throw new MessageError(message("runtime.consoleSaveType"));
  const files = progress?.files ?? [];
  const native =
    progress?.kind === "game-save" ? files[0] : files.find((file) => file.name === "save.srm");
  if (progress?.kind === "game-save" && files.length !== 1)
    throw new MessageError(message("runtime.nativeSaveRequired"));
  if (disc && native && native.bytes.length !== 73728)
    throw new MessageError(message("runtime.megaCdSave"));
  const state = files.find((file) => file.name === "__runtime/state.bin");
  if (progress?.kind === "snapshot" && !state)
    throw new MessageError(message("runtime.snapshotMissing"));
  // Archives use their canonical CUE basename; each iframe owns an isolated MEMFS.
  const savePath = `/data/saves/${system.directory}/${system.saveName ?? launch.profileId}.srm`;
  const base = "/runtimes/emulatorjs-4.2.3/data/";
  const localization = await consoleLocale(base, launch.locale);
  loadStyle(`${base}emulator.min.css`);
  await loadScript(`${base}emulator.min.js`);
  const Engine = (
    window as Window & {
      EmulatorJS?: new (selector: string, options: Record<string, unknown>) => Emulator;
    }
  ).EmulatorJS;
  if (!Engine) throw new MessageError(message("runtime.consoleResources"));
  const emulator = new Engine("#runtime", {
    ...localization,
    system: runtime.core,
    // Large discs must not consume Chromium's Blob quota before WASM is loaded.
    // Use this iframe's Uint8Array prototype for the wrapper's instanceof check.
    gameUrl: disc
      ? new Uint8Array(
          launch.gameBytes.buffer,
          launch.gameBytes.byteOffset,
          launch.gameBytes.byteLength,
        )
      : url(launch.gameBytes),
    gameName: `${launch.profileId}.${system.extension}`,
    ...(system.controls ? { controlScheme: system.controls } : {}),
    ...(launch.game.system === "segacd"
      ? {
          defaultOptions: { picodrive_ramcart: "disabled" },
          hideSettings: ["picodrive_ramcart"],
        }
      : {}),
    dataPath: base,
    startOnLoad: true,
    disableDatabases: true,
    disableLocalStorage: true,
    buttonOpts: {
      // The workspace owns pause/resume and revision-aware restarts.
      playPause: false,
      restart: false,
      quickSave: false,
      quickLoad: false,
      saveState: false,
      loadState: false,
      saveSavFiles: false,
      loadSavFiles: false,
      cacheManager: false,
      exitEmulation: false,
    },
  });
  const stateLoader = await new Promise<ConsoleStateLoader>((resolve, reject) => {
    emulator.on("exit", () => reject(new MessageError(message("runtime.startFailed"))));
    emulator.on("saveDatabaseLoaded", () => {
      // This event precedes ROM loading. Replace IDBFS with a memory mount
      // directory so browser leftovers cannot replace the selected cloud revision.
      emulator.gameManager.FS.unmount("/data/saves");
      emulator.gameManager.FS.mount(emulator.gameManager.FS.filesystems.MEMFS, {}, "/data/saves");
      emulator.gameManager.writeFile(
        savePath,
        native && !disc ? new Uint8Array(native.bytes) : new Uint8Array(),
      );
    });
    emulator.on("start", () => {
      void (async () => {
        if (emulator.gameManager.getSaveFilePath() !== savePath)
          throw new MessageError(message("runtime.savePathMismatch"));
        if (disc) {
          // Start without a cart so PicoDrive frees its smaller cartridge buffer.
          // Enable after startup, then reset to allocate the full 72 KiB CD buffer.
          emulator.gameManager.setVariable("picodrive_ramcart", "enabled");
          await new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          );
          emulator.gameManager.restart();
          if (native) {
            emulator.gameManager.writeFile(savePath, new Uint8Array(native.bytes));
            emulator.gameManager.loadSaveFiles();
          }
        }
        const loader = createConsoleStateLoader(emulator.gameManager);
        if (state) {
          loader.load(state.bytes);
          // RetroArch applies a queued state load at its next frame boundary.
          await new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          );
        }
        resolve(loader);
      })().catch(reject);
    });
  });
  if (window.matchMedia("(pointer: coarse)").matches) emulator.menu.close();
  const bindings = consoleControls(emulator, localization.langJson);
  const playback = guardConsolePlayback(emulator);
  async function capture(): Promise<RuntimeProgress> {
    playback.pause();
    const captured: RuntimeFile[] = [];
    const save = emulator.gameManager.getSaveFile();
    if (save?.byteLength) captured.push({ name: "save.srm", bytes: new Uint8Array(save) });
    if (emulator.gameManager.supportsStates()) {
      captured.push({
        name: "__runtime/state.bin",
        bytes: new Uint8Array(emulator.gameManager.getState()),
      });
      return { kind: "snapshot", files: captured, runtime };
    }
    return { kind: "game-save", files: captured };
  }
  return {
    controls: bindings.controls,
    touch: new TouchInput(
      [4, 5, 6, 7],
      bindings.buttons.filter(
        ({ code }) => (code < 4 || code >= 8) && !(launch.game.system === "nes" && code >= 10),
      ),
      (code, down) => emulator.gameManager.simulateInput(0, code, down ? 1 : 0),
    ),
    pause: playback.pause,
    resume: playback.resume,
    capture: async () => {
      const progress = await capture();
      return progress.files.length ? progress : null;
    },
    ...(launch.game.system === "md" || disc
      ? {
          snapshot: {
            read: capture,
            replace: (previous: RuntimeProgress, next: RuntimeProgress) =>
              restoreEditedState(
                {
                  pause: playback.pause,
                  load: stateLoader.load,
                  capture,
                  advance: playback.advance,
                },
                previous,
                next,
              ),
          },
        }
      : {}),
    async stop() {
      bindings.dispose();
      playback.pause();
      stateLoader.dispose();
      for (const value of urls) URL.revokeObjectURL(value);
    },
  };
}
