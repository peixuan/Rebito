import { unzipSync, zipSync } from "fflate";
import { MessageError, message } from "../../src/shared/messages.ts";
import { loadScript, loadStyle } from "./assets.ts";
import { runtimeIdentity } from "./identity.ts";
import { pixelScale } from "./pixel-scale.ts";
import type { RuntimeFile, RuntimeHandle, RuntimeLaunch } from "./types.ts";

interface FsNode {
  name: string;
  nodes: FsNode[] | null;
}
interface CommandInterface {
  pause(): void;
  resume(): void;
  persist(onlyChanges: boolean): Promise<Uint8Array<ArrayBuffer> | null>;
  fsTree(): Promise<FsNode>;
  fsReadFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
}
interface DosPlayer {
  setNoCloud(value: boolean): void;
  setMouseCapture(value: boolean): void;
  stop(): Promise<void>;
}
type DosFunction = (element: HTMLDivElement, options: Record<string, unknown>) => DosPlayer;
const changesName = "__runtime/filesystem.zip";

function paths(nodes: FsNode[], prefix = ""): string[] {
  return nodes.flatMap((node) =>
    node.nodes ? paths(node.nodes, `${prefix}${node.name}/`) : [`${prefix}${node.name}`],
  );
}

export async function startDos(
  element: HTMLDivElement,
  launch: RuntimeLaunch,
): Promise<RuntimeHandle> {
  const base = "/runtimes/jsdos-8.5.3/";
  element.classList.add("dos-runtime");
  loadStyle(`${base}js-dos.css`);
  await loadScript(`${base}js-dos.js`);
  const dos = (window as Window & { Dos?: DosFunction }).Dos;
  if (!dos) throw new MessageError(message("runtime.dosResources"));
  const configuration = unzipSync(new Uint8Array(launch.gameBytes), {
    filter: (file) => file.name === ".jsdos/dosbox.conf" && file.originalSize <= 32_768,
  })[".jsdos/dosbox.conf"];
  if (!configuration) throw new MessageError(message("runtime.dosConfiguration"));
  const files = launch.progress?.files ?? [];
  // The core extracts bundles after initFs file writes. A final ZIP is required
  // for edited native files to win over the older filesystem overlay.
  const overlay = files.find((file) => file.name === changesName);
  const nativeFiles = files.filter((file) => file.name !== changesName);
  const initFs = [
    new Uint8Array(launch.gameBytes),
    ...(overlay ? [new Uint8Array(overlay.bytes)] : []),
    ...(nativeFiles.length
      ? [
          zipSync(
            Object.fromEntries(nativeFiles.map((file) => [file.name, new Uint8Array(file.bytes)])),
          ),
        ]
      : []),
  ];
  let resolveReady: (ci: CommandInterface) => void = () => {};
  const ready = new Promise<CommandInterface>((resolve) => {
    resolveReady = resolve;
  });
  const player = dos(element, {
    // Config plus in-memory bundles avoids persistent OPFS copies of blob URLs.
    dosboxConf: new TextDecoder().decode(configuration),
    initFs,
    pathPrefix: `${base}emulators/`,
    backend: "dosbox",
    backendLocked: true,
    opfsRoot: `retro-${launch.profileId}`,
    autoStart: true,
    autoSave: false,
    quickSave: false,
    kiosk: true,
    workerThread: true,
    mouseCapture: false,
    imageRendering: "pixelated",
    renderAspect: "AsIs",
    lang: "en",
    fsChanges: { local: false, pull: async () => null },
    onEvent: (event: string, ci: CommandInterface) => {
      if (event === "ci-ready") resolveReady(ci);
    },
  });
  player.setNoCloud(true);
  const ci = await ready;
  const canvas = element.querySelector("canvas");
  if (!canvas) throw new MessageError(message("runtime.dosCanvas"));
  const scaling = pixelScale(canvas);
  function releasePointer(event: KeyboardEvent) {
    if (event.key !== "Escape" || !document.pointerLockElement) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    document.exitPointerLock();
  }
  window.addEventListener("keydown", releasePointer, true);
  return {
    pause: () => ci.pause(),
    resume: () => ci.resume(),
    setIntegerScaling: (enabled) => scaling.setEnabled(enabled),
    setMouseCapture(enabled) {
      player.setMouseCapture(enabled);
      if (!enabled && document.pointerLockElement) document.exitPointerLock();
    },
    async capture() {
      ci.pause();
      const captured: RuntimeFile[] = [];
      const available = paths((await ci.fsTree()).nodes ?? []);
      for (const name of launch.game.saveFiles) {
        const actual = available.find((path) => path.toLowerCase() === name.toLowerCase());
        if (actual) captured.push({ name, bytes: new Uint8Array(await ci.fsReadFile(actual)) });
      }
      const changes = await ci.persist(true);
      if (changes) captured.push({ name: changesName, bytes: new Uint8Array(changes) });
      return captured.length
        ? { kind: "filesystem", files: captured, runtime: runtimeIdentity("dos") }
        : null;
    },
    async stop() {
      scaling.dispose();
      window.removeEventListener("keydown", releasePointer, true);
      if (document.pointerLockElement) document.exitPointerLock();
      await player.stop();
    },
  };
}
