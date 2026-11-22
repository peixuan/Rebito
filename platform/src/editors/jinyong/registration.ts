import { message } from "../../shared/messages.ts";
import type { EditorRegistration } from "../registry.ts";
import { jinyongAdapter } from "./adapter.ts";

export const jinyongRegistration: EditorRegistration = {
  label: message("editor.jinyongTitle"),
  system: "dos",
  instructions: message("editor.jinyongDescription"),
  adapter: jinyongAdapter,
};
