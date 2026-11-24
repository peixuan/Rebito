import { message } from "../../shared/messages.ts";
import type { EditorView } from "../types.ts";
import { type San3Document, san3Layout } from "./document.ts";

/** Explain capital, governor, advisor and role effects without exposing pointer writes. */
export function san3RulerPreview(before: San3Document, after: San3Document, faction: number) {
  const previous = before.faction(faction).ruler;
  const successor = after.faction(faction).ruler;
  const officerName = (index: number) =>
    index === 0xffff
      ? message("san3.none")
      : before.officer(index).name || message("san3.officerRecord", { index: index + 1 });
  const cityName = (index: number) =>
    before.city(index).name || message("san3.cityRecord", { index: index + 1 });
  const capital = (document: San3Document) =>
    (document.read(document.offset("factions", faction) + 2, 4) - san3Layout.cities.offset) /
    san3Layout.cities.stride;
  const oldCapital = capital(before);
  const newCapital = capital(after);
  const preview: EditorView["preview"] = [
    {
      key: `ruler.${faction}.officer`,
      label: message("san3.replaceRuler"),
      before: officerName(previous),
      after: officerName(successor),
    },
  ];
  if (oldCapital !== newCapital)
    preview.push({
      key: `ruler.${faction}.capital`,
      label: message("san3.capital"),
      before: cityName(oldCapital),
      after: cityName(newCapital),
    });
  const officers = new Set([previous, successor]);
  for (const city of new Set([oldCapital, newCapital])) {
    const base = before.offset("cities", city);
    officers.add(before.read(base + 4, 2));
    for (const [id, relative] of [
      ["governor", 4],
      ["advisor", 10],
      ["delegation", 23],
    ] as const) {
      const delegation = id === "delegation";
      const previousValue = before.read(base + relative, delegation ? 1 : 2);
      const nextValue = after.read(base + relative, delegation ? 1 : 2);
      const from = delegation ? previousValue & 3 : previousValue;
      const to = delegation ? nextValue & 3 : nextValue;
      if (from === to) continue;
      preview.push({
        key: `ruler.${faction}.city${city}.${id}`,
        label: message("editor.columnLabel", {
          group: cityName(city),
          field: message(`san3.${id}`),
        }),
        before: delegation ? from : officerName(from),
        after: delegation ? to : officerName(to),
      });
    }
  }
  for (const index of officers) {
    if (index === 0xffff) continue;
    const base = before.offset("officers", index);
    for (const [id, relative] of [
      ["role", 12],
      ["loyalty", 15],
    ] as const) {
      const from = before.read(base + relative, 1);
      const to = after.read(base + relative, 1);
      if (from === to) continue;
      preview.push({
        key: `ruler.${faction}.${index}.${id}`,
        label: message("editor.columnLabel", {
          group: officerName(index),
          field: message(`san3.${id}`),
        }),
        before: id === "role" ? message(`san3.role${from}`) : from,
        after: id === "role" ? message(`san3.role${to}`) : to,
      });
    }
  }
  return preview;
}
