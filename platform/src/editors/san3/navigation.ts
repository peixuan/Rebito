import { message } from "../../shared/messages.ts";
import type { EditorView } from "../types.ts";
import { san3Availability } from "./availability.ts";
import { san3FieldLayout } from "./layout.ts";

const phases = [
  {
    name: "strategy",
    requirement: "requiresStrategy",
    modules: ["cities", "officers", "custom", "factions", "treasures"],
  },
  { name: "battle", requirement: "requiresBattle", modules: ["battle", "reserves"] },
  { name: "registration", requirement: "requiresCreation", modules: ["presets"] },
] as const;

/** Navigation describes every supported phase without admitting cross-phase edits. */
export function san3Navigation(view: EditorView): EditorView {
  const available = new Set(view.modules.map(({ id }) => id));
  return {
    ...san3FieldLayout(san3Availability(view)),
    modules: phases.flatMap(({ name, requirement, modules }) =>
      modules.map((id) => {
        const reason =
          id === "reserves" && available.has("battle") ? "requiresReserves" : requirement;
        const label = id === "presets" ? "presetStats" : id === "reserves" ? "cityReserves" : id;
        return {
          id,
          phase: message(`san3.phase.${name}`),
          label: message(`san3.${label}`),
          description: message(`san3.navigation.${id}`),
          ...(available.has(id) ? {} : { unavailableReason: message(`san3.navigation.${reason}`) }),
        };
      }),
    ),
  };
}
