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
  md: {
    core: "genesis_plus_gx",
    directory: "Genesis Plus GX",
    extension: "md",
    // The 4.2.3 MD settings menu omits its own scheme; Sega CD has the same pad.
    controls: "segaCD",
  },
  sms: {
    core: "genesis_plus_gx",
    directory: "Genesis Plus GX",
    extension: "sms",
    controls: "segaMS",
  },
  gg: {
    core: "genesis_plus_gx",
    directory: "Genesis Plus GX",
    extension: "gg",
    controls: "segaGG",
  },
};
