import { message } from "../../shared/messages.ts";
import type { EditorView } from "../types.ts";
import { san3Availability } from "./availability.ts";
import { san3FieldLayout } from "./layout.ts";

const modules = [
  "cities",
  "officers",
  "custom",
  "factions",
  "treasures",
  "battle",
  "reserves",
  "presets",
] as const;

/** Navigation describes every supported phase without admitting cross-phase edits. */
export function san3Navigation(view: EditorView): EditorView {
  const available = new Set(view.modules.map(({ id }) => id));
  return {
    ...san3FieldLayout(san3Availability(view)),
    modules: modules.map((id) => ({
      id,
      label: message(
        `san3.${id === "presets" ? "presetStats" : id === "reserves" ? "cityReserves" : id}`,
      ),
      description: message(`san3.navigation.${id}`),
      ...(available.has(id)
        ? {}
        : {
            unavailableReason: message(
              `san3.navigation.${
                id === "presets"
                  ? "requiresCreation"
                  : id === "reserves" && available.has("battle")
                    ? "requiresReserves"
                    : id === "battle" || id === "reserves"
                      ? "requiresBattle"
                      : "requiresStrategy"
              }`,
            ),
          }),
    })),
  };
}
