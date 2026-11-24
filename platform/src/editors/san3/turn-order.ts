import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import type { San3Document } from "./document.ts";
import { san3Layout } from "./document.ts";
import { san3OperationLabels, san3OperationPreview } from "./operation-preview.ts";

const queueOffset = 0x7dbb2;
const invalid = () => new EditorError("invalid_edit", message("san3.invalidTurnOrder"));

/** The native dispatcher keeps the current slot address; only its unconsumed suffix can move. */
export function inspectSan3TurnOrder(document: San3Document) {
  const factions: number[] = [];
  for (let slot = 0; slot <= san3Layout.factions.count; slot++) {
    const pointer = document.read(queueOffset + slot * 4, 4);
    if (!pointer) break;
    const faction = (pointer - san3Layout.factions.offset) / san3Layout.factions.stride;
    if (!Number.isInteger(faction) || faction < 0 || faction >= 21 || factions.includes(faction))
      throw invalid();
    factions.push(faction);
  }
  const cursor = document.read(0x7dc1f, 1);
  const current = factions[cursor];
  if (
    !factions.length ||
    factions.length > 21 ||
    current === undefined ||
    !document.faction(current).active ||
    document.read(0x7dc22, 4) !== document.offset("factions", current)
  )
    throw invalid();
  return { factions, cursor };
}

/** Assign requested future positions together; displaced factions retain their relative order. */
export function editSan3TurnOrder(document: San3Document, draft: Record<string, number>) {
  const { factions, cursor } = inspectSan3TurnOrder(document);
  const slots = factions.flatMap((faction, slot) =>
    slot > cursor && document.faction(faction).active ? [slot] : [],
  );
  const requests = new Map<number, number>();
  for (const [key, position] of Object.entries(draft)) {
    const match = /^turnOrder\.(0|[1-9]\d?)\.position$/.exec(key);
    if (!match || !Number.isSafeInteger(position)) throw invalid();
    const faction = Number(match[1]);
    const before = factions.indexOf(faction);
    if (!slots.includes(before) || !slots.includes(position - 1)) throw invalid();
    if ([...requests.values()].includes(position)) throw invalid();
    requests.set(faction, position);
  }
  const remaining = slots
    .map((slot) => factions[slot] as number)
    .filter((faction) => !requests.has(faction));
  const ordered = [...factions];
  const assigned = new Map([...requests].map(([faction, position]) => [position - 1, faction]));
  for (const slot of slots) {
    const faction = assigned.get(slot) ?? remaining.shift();
    if (faction === undefined) throw invalid();
    ordered[slot] = faction;
  }
  const bytes = document.copy();
  const data = new DataView(bytes.buffer);
  const changes = Object.fromEntries(
    ordered.flatMap((faction, slot) =>
      factions[slot] === faction ? [] : [[`turnOrder.${faction}.position`, slot + 1]],
    ),
  );
  const writes: { offset: number; width: 4; before: number; after: number }[] = [];
  const { append, preview } = san3OperationPreview();
  const labels = san3OperationLabels(document);
  for (const [slot, faction] of ordered.entries()) {
    const before = factions.indexOf(faction) + 1;
    if (before === slot + 1) continue;
    const offset = queueOffset + slot * 4;
    const after = document.offset("factions", faction);
    data.setUint32(offset, after);
    writes.push({ offset, width: 4, before: document.read(offset, 4), after });
    append(
      `turnOrder.${faction}.position`,
      labels.faction(faction),
      "turnPosition",
      before,
      slot + 1,
    );
  }
  return { bytes, changes, preview, writes };
}
