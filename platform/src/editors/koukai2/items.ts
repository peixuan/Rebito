import { message } from "../../shared/messages.ts";
// Reserved inventory IDs, independent of their translated labels.
export const blankItemIds = new Set([27, 28, 45, 46, 47, 48, 49, 79]);
export const itemNames = Array.from({ length: 100 }, (_, index) =>
  message(`koukai2.itemNames.${index}`),
);
