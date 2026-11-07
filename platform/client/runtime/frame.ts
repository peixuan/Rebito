import { startConsole } from "./console.ts";
import { startDos } from "./dos.ts";
import type { RuntimeWindow } from "./types.ts";

(window as RuntimeWindow).retroRuntime = {
  async start(launch) {
    document.documentElement.lang = launch.locale ?? "en";
    const element = document.querySelector<HTMLDivElement>("#runtime");
    if (!element) throw new Error("Missing runtime host");
    if (launch.game.system === "dos") return startDos(element, launch);
    return startConsole(launch);
  },
};
