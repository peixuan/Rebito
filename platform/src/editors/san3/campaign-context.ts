import { type DisplayText, message } from "../../shared/messages.ts";
import type { EditorField, EditorTextField } from "../types.ts";
import { type San3Document, san3Layout } from "./document.ts";
import { san3ListContext } from "./list-context.ts";
import { decodeSan3Name } from "./names.ts";

/** Compute list-derived context once per view; malformed lists never become guessed totals. */
export function san3CampaignContext(document: San3Document) {
  let graph: ReturnType<typeof san3ListContext> | undefined;
  try {
    graph = san3ListContext(document);
  } catch {
    /* Scalar inspection remains available. */
  }
  const officerName = (index: number): DisplayText =>
    index === 0xffff
      ? message("san3.none")
      : document.officer(index).name || message("san3.officerRecord", { index: index + 1 });
  const field = (id: string, value: number, name?: DisplayText): EditorField => ({
    key: `context.${id}`,
    columnId: id,
    label: message(`san3.${id}`),
    group: message("san3.context"),
    value,
    min: 0,
    max: Math.max(1, value),
    readonly: true,
    ...(name === undefined ? {} : { choices: [{ value, label: name }] }),
  });
  return (module: string, index: number): EditorField[] => {
    if (module === "officers") {
      const offset = document.offset("officers", index);
      const role = document.read(offset + 12, 1);
      const origin = document.read(offset + 19, 1);
      const ruler = origin < 21 ? document.faction(origin).ruler : 0xffff;
      return [
        field("role", role, role <= 6 ? message(`san3.role${role}`) : message("san3.inactive")),
        field(
          "originFaction",
          origin,
          ruler === 0xffff
            ? message("san3.none")
            : message("san3.factionOf", { ruler: officerName(ruler) }),
        ),
      ];
    }
    if (module !== "cities") return [];
    const lists = graph?.cities[index];
    if (!lists) return [];
    return [
      field("governor", lists.serving[0] ?? 0xffff, officerName(lists.serving[0] ?? 0xffff)),
      field("advisor", lists.advisor, officerName(lists.advisor)),
      field("servingCount", lists.serving.length),
      field("freeCount", lists.free.length),
      field("hiddenCount", lists.hidden.length),
      field(
        "soldiers",
        lists.serving.reduce((sum, officer) => sum + document.officer(officer).soldiers, 0),
      ),
    ];
  };
}

/** Phonetic names are useful context even when the kanji display is fully decoded. */
export function san3ReadingField(document: San3Document, index: number): EditorTextField {
  document.offset("officers", index);
  const offset =
    index < san3Layout.historical.count
      ? san3Layout.historical.offset + index * san3Layout.historical.stride + 22
      : san3Layout.custom.offset +
        (index - san3Layout.historical.count) * san3Layout.custom.stride +
        20;
  return {
    key: `reading.${index}`,
    label: message("san3.kana"),
    value: decodeSan3Name(document.copy().subarray(offset, offset + 8)),
    maxLength: 7,
    readonly: true,
  };
}
