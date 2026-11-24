import { type DisplayText, message } from "../../shared/messages.ts";
import type { EditorView } from "../types.ts";
import type { San3Document } from "./document.ts";

/** Shared names for operation inputs and their dependent effects. */
export function san3OperationLabels(document: San3Document) {
  const officer = (index: number): DisplayText =>
    index === 65535
      ? message("san3.none")
      : document.officer(index).name || message("san3.officerRecord", { index: index + 1 });
  const city = (index: number): DisplayText =>
    index === 255
      ? message("san3.none")
      : document.city(index).name || message("san3.cityRecord", { index: index + 1 });
  const faction = (index: number): DisplayText =>
    index === 255
      ? message("san3.none")
      : message("san3.factionOf", { ruler: officer(document.faction(index).ruler) });
  return { officer, city, faction };
}

export function san3OperationPreview() {
  const preview: EditorView["preview"] = [];
  const append = (
    key: string,
    group: DisplayText,
    field: string,
    before: EditorView["preview"][number]["before"],
    after: EditorView["preview"][number]["after"],
  ) => {
    if (before !== after)
      preview.push({
        key,
        label: message("editor.columnLabel", { group, field: message(`san3.${field}`) }),
        before,
        after,
      });
  };
  return { preview, append };
}
