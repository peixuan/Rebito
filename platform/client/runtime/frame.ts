import { startConsole } from "./console.ts";
import { startDos } from "./dos.ts";
import { withRuntimeKeyboard } from "./keyboard.ts";
import type { RuntimeWindow } from "./types.ts";

(window as RuntimeWindow).retroRuntime = {
  async start(launch) {
    document.documentElement.lang = launch.locale ?? "en";
    const element = document.querySelector<HTMLDivElement>("#runtime");
    if (!element) throw new Error("Missing runtime host");
    const handle =
      launch.game.system === "dos" ? await startDos(element, launch) : await startConsole(launch);
    return withRuntimeKeyboard(element, handle);
  },
};
