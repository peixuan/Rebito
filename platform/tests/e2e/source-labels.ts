import { readFileSync } from "node:fs";

// Proper names follow the verified Chinese game edition, regardless of the UI locale.
const names: Record<string, string> = JSON.parse(
  readFileSync(
    new URL("../../client/locales/shared/editors/personNames.json", import.meta.url),
    "utf8",
  ),
);
export function sourcePerson(index: number): string {
  const name = names[`koukai2.personNames.${index}`];
  if (!name) throw new Error(`Unknown fixture character ${index}`);
  return name;
}
