type ChoiceCodes = Readonly<Record<string, string>>;
/** Full ROM digest → setting label → choice and its complete code group. */
type NesCatalog = Readonly<Record<string, Readonly<Record<string, ChoiceCodes>>>>;

export const inGame: NesCatalog = {};

export const onTitle: NesCatalog = {
  // Mitsume ga Tooru
  "545f33d21ef9804b114d837455fed456fbd6652e76cb520e6458b416426db5c1": {
    sharakuHealth: { bars2: "007A:02", bars6: "007A:06" },
  },
};
