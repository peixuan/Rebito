export const systemIds = ["dos", "nes", "snes", "gb", "gba", "md", "sms", "gg"] as const;
export type GameSystem = (typeof systemIds)[number];

/** Shared upload/catalog labels and extensions; emulator bindings remain in the adapter. */
export const gameSystems: Record<
  GameSystem,
  { label: string; shortLabel: string; extensions: string[] }
> = {
  dos: { label: "DOS", shortLabel: "DOS", extensions: [".zip", ".jsdos"] },
  nes: { label: "FC / NES", shortLabel: "FC", extensions: [".nes"] },
  snes: { label: "SFC / SNES", shortLabel: "SFC", extensions: [".sfc", ".smc"] },
  gb: { label: "GB", shortLabel: "GB", extensions: [".gb"] },
  gba: { label: "GBA", shortLabel: "GBA", extensions: [".gba"] },
  md: { label: "Sega MD / Genesis", shortLabel: "MD", extensions: [".md", ".bin", ".gen", ".smd"] },
  sms: { label: "Sega Master System", shortLabel: "SMS", extensions: [".sms"] },
  gg: { label: "Sega Game Gear", shortLabel: "GG", extensions: [".gg"] },
};
export const systemOptions = systemIds.map((value) => ({ value, label: gameSystems[value].label }));
