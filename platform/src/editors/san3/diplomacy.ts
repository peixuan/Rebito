import { message } from "../../shared/messages.ts";
import type { EditorField } from "../types.ts";
import type { San3Document } from "./document.ts";
import { invalidGovernance } from "./governance-core.ts";
import { san3OperationLabels, san3OperationPreview } from "./operation-preview.ts";

function activeFaction(document: San3Document, index: number) {
  const base = document.offset("factions", index);
  if (!document.faction(index).active) throw invalidGovernance();
  return base;
}

/** Alliances are reciprocal; hostility is the selected faction's opinion of another. */
export function san3DiplomacyFields(document: San3Document, index: number): EditorField[] {
  const base = document.offset("factions", index);
  if (!document.faction(index).active) return [];
  const names = san3OperationLabels(document);
  const fields: EditorField[] = [];
  for (let target = 0; target < 21; target++) {
    if (target === index || !document.faction(target).active) continue;
    for (const kind of ["alliance", "hostility"] as const)
      fields.push({
        key: `diplomacy.${index}.${kind}.${target}`,
        columnId: `${kind}.${target}`,
        label: message(`san3.${kind}`),
        group: names.faction(target),
        help: message(`san3.${kind}EditHelp`),
        value:
          kind === "alliance"
            ? (document.read(base + 6, 4) >>> target) & 1
            : document.read(base + 15 + target, 1),
        min: 0,
        max: kind === "alliance" ? 1 : 100,
        ...(kind === "alliance"
          ? {
              choices: [0, 1].map((value) => ({
                value,
                label: message(value ? "common.yes" : "common.no"),
              })),
            }
          : {}),
      });
  }
  return fields;
}

/** Native alliance setters update both masks; hostility setters clamp each directed byte. */
export function editSan3Diplomacy(document: San3Document, changes: Record<string, number>) {
  const requests = new Map<
    string,
    { source: number; target: number; alliance: boolean; value: number }
  >();
  const add = (source: number, target: number, alliance: boolean, value: number) => {
    const key = `diplomacy.${source}.${alliance ? "alliance" : "hostility"}.${target}`;
    const previous = requests.get(key);
    if (previous && previous.value !== value) throw invalidGovernance();
    requests.set(key, { source, target, alliance, value });
  };
  for (const [key, value] of Object.entries(changes)) {
    const match = /^diplomacy\.(0|[1-9]\d?)\.(alliance|hostility)\.(0|[1-9]\d?)$/.exec(key);
    if (!match) throw invalidGovernance();
    const source = Number(match[1]);
    const target = Number(match[3]);
    const alliance = match[2] === "alliance";
    activeFaction(document, source);
    activeFaction(document, target);
    if (source === target || !Number.isInteger(value) || value < 0 || value > (alliance ? 1 : 100))
      throw invalidGovernance();
    add(source, target, alliance, value);
    if (alliance) add(target, source, true, value);
  }
  const bytes = document.copy();
  const data = new DataView(bytes.buffer);
  const names = san3OperationLabels(document);
  const { preview, append } = san3OperationPreview();
  const intents: Record<string, number> = {};
  const touched = new Map<number, 1 | 4>();
  for (const [key, { source, target, alliance, value }] of [...requests].sort()) {
    const base = document.offset("factions", source);
    const offset = base + (alliance ? 6 : 15 + target);
    const before = alliance ? (document.read(offset, 4) >>> target) & 1 : document.read(offset, 1);
    if (before === value) continue;
    if (alliance) {
      const mask = data.getUint32(offset);
      data.setUint32(offset, value ? mask | (1 << target) : mask & ~(1 << target));
    } else data.setUint8(offset, value);
    touched.set(offset, alliance ? 4 : 1);
    intents[key] = value;
    append(
      key,
      message("san3.relationBetween", {
        source: names.faction(source),
        target: names.faction(target),
      }),
      alliance ? "alliance" : "hostility",
      before,
      value,
    );
  }
  const writes = [...touched]
    .map(([offset, width]) => ({
      offset,
      width,
      before: document.read(offset, width),
      after: width === 1 ? data.getUint8(offset) : data.getUint32(offset),
    }))
    .sort((a, b) => a.offset - b.offset);
  return { bytes, changes: intents, preview, writes };
}
