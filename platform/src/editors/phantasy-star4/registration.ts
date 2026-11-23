import { message } from "../../shared/messages.ts";
import type { EditorRegistration } from "../registry.ts";
import { createPhantasyStar4Adapter, phantasyStar4Adapter } from "./adapter.ts";
import { parsePhantasyStar4Rules } from "./rules.ts";

export const phantasyStar4Registration: EditorRegistration = {
  label: message("editor.phantasyStar4Title"),
  instructions: message("editor.phantasyStar4Description"),
  system: "md",
  snapshot: { core: "genesis_plus_gx", domain: "main" },
  adapter: phantasyStar4Adapter,
  gameData: {
    maxBytes: 4 * 1024 ** 2,
    bind: (bytes) => createPhantasyStar4Adapter(parsePhantasyStar4Rules(bytes)),
  },
};
