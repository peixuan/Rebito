import { message } from "../../shared/messages.ts";
export const personNames = Array.from({ length: 120 }, (_, index) =>
  message(`koukai2.personNames.${index}`),
);

export const portNames = Array.from({ length: 100 }, (_, index) =>
  message(`koukai2.portNames.${index}`),
);
