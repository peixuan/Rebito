import { message } from "../../shared/messages.ts";
import { EditorError, type EditorField, type EditorView } from "../types.ts";
import { type San3Document, san3Layout } from "./document.ts";
import { inspectSan3Lists } from "./relocation.ts";

const invalid = () => new EditorError("invalid_edit", message("editor.invalidEdit"));
const ids = ["recoveryMonths", "infiltrationMonths", "originFaction", "rebellionFaction"] as const;

function inspect(document: San3Document, index: number) {
  const base = document.offset("officers", index);
  const member = inspectSan3Lists(document).membership.get(index);
  const flags = document.read(base + 8, 1);
  const status = document.read(base + 9, 1);
  const covert = document.read(base + 11, 1);
  const origin = document.read(base + 19, 1);
  const faction = document.read(base + 17, 1);
  const task = document.read(base + 26, 1);
  const idle =
    member &&
    member.kind !== "hidden" &&
    (flags & 0x14) === 0 &&
    (status & 64) === 0 &&
    (task === 0 || task === 255) &&
    document.read(base + 27, 1) === 0;
  return { base, member, flags, status, covert, origin, faction, idle };
}

/** Explicit monthly counters and the pending drive-tiger plan, without changing city ownership. */
export function campaignStateFields(document: San3Document, index: number): EditorField[] {
  const state = inspect(document, index);
  const { flags, status, covert, origin, faction, member, idle } = state;
  const ruler = document.officer(index).role === 0;
  const choices = Array.from({ length: san3Layout.factions.count }, (_, value) => value)
    .filter((value) => value !== faction && document.faction(value).active)
    .map((value) => ({
      value,
      label: document.officer(document.faction(value).ruler).name || String(value + 1),
    }));
  const values = {
    recoveryMonths: status & 7,
    infiltrationMonths: covert & 7,
    originFaction: origin,
    rebellionFaction: (flags & 8) !== 0 ? origin : 255,
  };
  const allowed = {
    recoveryMonths: true,
    infiltrationMonths: !ruler && (covert & 0x18) === 8 && origin < san3Layout.factions.count,
    originFaction:
      !ruler &&
      (covert & 0x10) === 0 &&
      ((covert & 8) !== 0 || (flags & 8) !== 0 || (status & 48) !== 0),
    rebellionFaction:
      member?.kind === "serving" && !ruler && (covert & 31) === 0 && (status & 48) === 0,
  };
  return ids.map((id) => ({
    key: `state.${index}.${id}`,
    label: message(`san3.${id}`),
    group: message("san3.lifecycle"),
    columnId: id,
    value: values[id],
    min: 0,
    max: id.endsWith("Months") ? 7 : 255,
    readonly: !idle || !allowed[id],
    ...(id.endsWith("Faction")
      ? {
          choices:
            id === "rebellionFaction"
              ? [...choices, { value: 255, label: message("san3.none") }]
              : choices,
        }
      : {}),
    help: message(`san3.${id}Help`),
  }));
}

/** Validate the complete requested state before masked writes; inactive records remain untouched. */
export function editSan3CampaignState(document: San3Document, changes: Record<string, number>) {
  const requests = new Map<number, Record<string, number>>();
  for (const [key, value] of Object.entries(changes)) {
    const match =
      /^state\.(0|[1-9]\d{0,2})\.(recoveryMonths|infiltrationMonths|originFaction|rebellionFaction)$/.exec(
        key,
      );
    if (!match || !Number.isSafeInteger(value)) throw invalid();
    requests.set(Number(match[1]), {
      ...requests.get(Number(match[1])),
      [match[2] as string]: value,
    });
  }
  const bytes = document.copy();
  const intents: Record<string, number> = {};
  const preview: EditorView["preview"] = [];
  const touched = new Set<number>();
  const write = (offset: number, value: number) => {
    bytes[offset] = value;
    touched.add(offset);
  };
  for (const [index, values] of requests) {
    const state = inspect(document, index);
    const fields = campaignStateFields(document, index);
    const altered = fields.filter(
      (field) => values[field.columnId] !== undefined && values[field.columnId] !== field.value,
    );
    if (!altered.length) continue;
    if (
      altered.some(
        (field) =>
          field.readonly ||
          (values[field.columnId] as number) < 0 ||
          (values[field.columnId] as number) > field.max,
      )
    )
      throw invalid();
    if (values.originFaction !== undefined && values.rebellionFaction !== undefined)
      throw invalid();
    const base = state.base;
    for (const field of altered) {
      const after = values[field.columnId] as number;
      if (field.columnId.endsWith("Faction") && after !== 255) {
        document.offset("factions", after);
        if (!document.faction(after).active || after === state.faction) throw invalid();
      }
      if (field.columnId === "recoveryMonths") {
        // Starting an injury sets the illness flag; an existing retreat counter keeps its flag.
        const hold = (state.status & 7) === 0 ? 8 : state.status & 8;
        write(base + 9, (state.status & 0xf0) | (after ? hold | after : 0));
      } else if (field.columnId === "infiltrationMonths") {
        const origin = values.originFaction ?? state.origin;
        if (!document.faction(origin).active || origin === state.faction) throw invalid();
        write(base + 11, (state.covert & 0xf8) | after);
      } else if (field.columnId === "originFaction") {
        if (after === 255) throw invalid();
        write(base + 19, after);
      } else {
        write(base + 8, (state.flags & 0xf7) | (after === 255 ? 0 : 8));
        // Native plan cancellation only clears the plan bit, preserving the stored affiliation.
        if (after !== 255) write(base + 19, after);
      }
      intents[field.key] = after;
      const display = (value: number) =>
        field.columnId.endsWith("Faction")
          ? value === 255
            ? message("san3.none")
            : (field.choices?.find((choice) => choice.value === value)?.label ?? value)
          : value;
      preview.push({
        key: field.key,
        label: field.label,
        before: display(field.value),
        after: display(after),
      });
    }
  }
  const writes = [...touched]
    .sort((a, b) => a - b)
    .map((offset) => ({
      offset,
      width: 1 as const,
      before: document.read(offset, 1),
      after: bytes[offset] as number,
    }))
    .filter(({ before, after }) => before !== after);
  return { bytes, writes, preview, changes: intents };
}
