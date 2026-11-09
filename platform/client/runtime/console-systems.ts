import type { GameSystem } from "../../src/domain/systems.ts";

export const consoleSystems: Record<
  Exclude<GameSystem, "dos">,
  {
    core: string;
    directory: string;
    extension: string;
    controls?: string;
  }
> = {
  nes: { core: "fceumm", directory: "FCEUmm", extension: "nes" },
  snes: { core: "snes9x", directory: "Snes9x", extension: "sfc" },
  gb: { core: "gambatte", directory: "Gambatte", extension: "gb" },
  gba: { core: "mgba", directory: "mGBA", extension: "gba" },
};
