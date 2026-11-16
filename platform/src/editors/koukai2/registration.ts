import { message } from "../../shared/messages.ts";
import type { EditorRegistration } from "../registry.ts";
import { koukaiAdapter } from "./adapter.ts";

/** Describe the save format without claiming to recognize every game edition. */
export const koukaiRegistration: EditorRegistration = {
  label: message("editor.koukaiTitle"),
  system: "dos",
  instructions: message("editor.koukaiDescription"),
  adapter: koukaiAdapter,
};
