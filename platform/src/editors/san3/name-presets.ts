import { type DisplayText, message } from "../../shared/messages.ts";
import { san3Attributes, san3Layout } from "./document.ts";

const textDefaults: Record<string, DisplayText> = {};
const numericDefaults: Record<string, number> = {};
for (let index = 0; index < san3Layout.custom.count; index++) {
  textDefaults[`custom.${index}.kanji`] = message(`san3.presetName${index}`);
  textDefaults[`custom.${index}.kana`] = message(`san3.presetReading${index}`);
  for (const attribute of san3Attributes)
    numericDefaults[`officer.${san3Layout.historical.count + index}.${attribute}`] = 100;
}

/** Suggested names and full abilities; registration and live membership stay explicit. */
export const san3NamePresetAction = {
  id: "custom-name-presets",
  label: message("san3.applyNamePresets"),
  help: message("san3.namePresetsHelp"),
  textDefaults,
  numericDefaults,
};
