import { message } from "../../shared/messages.ts";
import type { EditorRegistration } from "../registry.ts";
import { phantasyStar4Adapter } from "./adapter.ts";

export const phantasyStar4Registration: EditorRegistration = {
  label: message("editor.phantasyStar4Title"),
  instructions: message("editor.phantasyStar4Description"),
  system: "md",
  snapshot: { core: "genesis_plus_gx", domain: "main" },
  adapter: phantasyStar4Adapter,
};
