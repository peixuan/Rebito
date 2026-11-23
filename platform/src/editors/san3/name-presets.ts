import { type DisplayText, message } from "../../shared/messages.ts";
import { san3Layout } from "./document.ts";

const textDefaults: Record<string, DisplayText> = {};
for (let index = 0; index < san3Layout.custom.count; index++) {
  textDefaults[`custom.${index}.kanji`] = message(`san3.presetName${index}`);
  textDefaults[`custom.${index}.kana`] = message(`san3.presetReading${index}`);
}

/** Maintainer-authored name suggestions; importing them does not register officers. */
export const san3NamePresetAction = {
  id: "custom-name-presets",
  label: message("san3.applyNamePresets"),
  help: message("san3.namePresetsHelp"),
  textDefaults,
};
