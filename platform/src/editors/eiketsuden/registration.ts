import { message } from "../../shared/messages.ts";
import type { EditorRegistration } from "../registry.ts";
import { createEiketsudenAdapter, eiketsudenAdapter } from "./adapter.ts";
import { eiketsudenArchiveLimit, readEiketsudenRules } from "./rules-archive.ts";

export const eiketsudenRegistration: EditorRegistration = {
  label: message("editor.eiketsudenTitle"),
  instructions: message("editor.eiketsudenDescription"),
  system: "dos",
  adapter: eiketsudenAdapter,
  gameData: {
    maxBytes: eiketsudenArchiveLimit,
    bind: async (bytes) => createEiketsudenAdapter(await readEiketsudenRules(bytes)),
  },
};
