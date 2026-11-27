import { type DisplayText, message } from "../../shared/messages.ts";
import { inGame, onTitle } from "./catalog-data.ts";

export interface NesSetting {
  label: string;
  atTitle: boolean;
  choices: { label: DisplayText; code: string }[];
}

/** A renamed cartridge still matches. Translations and header variations are separate releases. */
export function nesSettingsFor(digest: string): NesSetting[] {
  const settings: NesSetting[] = [];
  for (const [catalog, atTitle] of [
    [inGame, false],
    [onTitle, true],
  ] as const) {
    if (!Object.hasOwn(catalog, digest)) continue;
    for (const [effect, entries] of Object.entries(catalog[digest] ?? {})) {
      settings.push({
        label: `nesCheats.${effect}`,
        atTitle,
        choices: Object.entries(entries).map(([label, code]) => ({
          // Numbers and values such as "30 MPH" are identical in both catalogs.
          label: /^\d/.test(label) ? label : message(`nesChoice.${label}`),
          code,
        })),
      });
    }
  }
  return settings;
}
