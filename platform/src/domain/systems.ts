export const systemIds = ["dos", "nes", "snes", "gb", "gba"] as const;
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
};
export const systemOptions = systemIds.map((value) => ({ value, label: gameSystems[value].label }));
