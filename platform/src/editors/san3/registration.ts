import { message } from "../../shared/messages.ts";
import type { EditorRegistration } from "../registry.ts";
import { san3Adapter } from "./adapter.ts";

export const san3Registration: EditorRegistration = {
  label: message("editor.san3Title"),
  instructions: message("editor.san3Description"),
  system: "segacd",
  snapshot: { core: "picodrive", domain: "program" },
  adapter: san3Adapter,
};
