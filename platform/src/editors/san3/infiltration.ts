import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import { San3Document } from "./document.ts";
import { inspectSan3Lists } from "./relocation.ts";

const invalid = () => new EditorError("invalid_edit", message("editor.invalidEdit"));

function context(document: San3Document, index: number) {
  const graph = inspectSan3Lists(document);
  const base = document.offset("officers", index);
  const member = graph.membership.get(index);
  if (!member || member.kind === "hidden" || (document.read(base + 8, 1) & 0x14) !== 0)
    throw invalid();
  return { graph, base, member };
}

function requireNewAgent(document: San3Document, index: number) {
  const value = context(document, index);
  const { graph, base, member } = value;
  const task = document.read(base + 26, 1);
  if (
    member.kind !== "serving" ||
    graph.rulers.has(index) ||
    graph.cities[member.city]?.serving[0] === index ||
    (document.read(base + 8, 1) & 8) !== 0 ||
    (document.read(base + 9, 1) & 0x7f) !== 0 ||
    (document.read(base + 11, 1) & 31) !== 0 ||
    (task !== 0 && task !== 255) ||
    document.read(base + 27, 1) !== 0
  )
    throw invalid();
  return value;
}

function draft(document: San3Document) {
  const bytes = document.copy();
  const data = new DataView(bytes.buffer);
  const writes: { offset: number; width: 1 | 2; before: number; after: number }[] = [];
  return {
    write(offset: number, width: 1 | 2, after: number) {
      const before = document.read(offset, width);
      if (before === after) return;
      writes.push({ offset, width, before, after });
      if (width === 1) data.setUint8(offset, after);
      else data.setUint16(offset, after);
    },
    finish() {
      inspectSan3Lists(new San3Document(bytes));
      return { bytes, writes: writes.sort((a, b) => a.offset - b.offset) };
    },
  };
}

/** The native deployment makes an agent free in the target city, awaiting recruitment. */
export function deploySan3Infiltrator(document: San3Document, index: number, destination: number) {
  document.offset("cities", destination);
  const { graph, base, member } = requireNewAgent(document, index);
  const source = graph.cities[member.city];
  const target = graph.cities[destination];
  if (
    !source ||
    !target ||
    target.faction === 255 ||
    source.faction === target.faction ||
    document.read(base + 2, 2) !== 0 ||
    (document.read(base + 10, 1) & 15) !== 0
  )
    throw invalid();
  const edit = draft(document);
  const previous = source.serving[source.serving.indexOf(index) - 1];
  if (previous === undefined) throw invalid();
  edit.write(document.offset("officers", previous), 2, document.read(base, 2));
  const tail = target.free.at(-1);
  edit.write(
    tail === undefined
      ? document.offset("cities", destination) + 6
      : document.offset("officers", tail),
    2,
    index,
  );
  edit.write(base, 2, 0xffff);
  if (source.advisor === index) edit.write(document.offset("cities", member.city) + 10, 2, 0xffff);
  edit.write(base + 11, 1, document.read(base + 11, 1) | 8);
  edit.write(base + 19, 1, source.faction);
  edit.write(base + 20, 1, document.read(base + 18, 1));
  edit.write(base + 12, 1, 5);
  edit.write(base + 15, 1, 0);
  edit.write(base + 16, 1, destination);
  edit.write(base + 17, 1, 255);
  edit.write(base + 18, 1, 0);
  edit.write(base + 21, 1, 0);
  edit.write(base + 22, 1, 0);
  edit.write(base + 26, 1, 255);
  edit.write(base + 28, 2, 0);
  return {
    ...edit.finish(),
    change: {
      index,
      fromCity: member.city,
      toCity: destination,
      originFaction: source.faction,
      priorServiceYears: document.read(base + 18, 1),
      advisorRemoved: source.advisor === index,
    },
  };
}

/** Establish an already-hired insider without relocating them or changing their current army. */
export function establishSan3Infiltration(
  document: San3Document,
  index: number,
  originFaction: number,
  priorServiceYears = 0,
) {
  const { base } = requireNewAgent(document, index);
  document.offset("factions", originFaction);
  const combined = document.read(base + 18, 1) + priorServiceYears;
  if (
    !document.faction(originFaction).active ||
    originFaction === document.read(base + 17, 1) ||
    !Number.isSafeInteger(priorServiceYears) ||
    priorServiceYears < 0 ||
    priorServiceYears > 255 ||
    combined < 1 ||
    combined > 256
  )
    throw invalid();
  const edit = draft(document);
  edit.write(base + 11, 1, document.read(base + 11, 1) | 8);
  edit.write(base + 19, 1, originFaction);
  edit.write(base + 20, 1, priorServiceYears);
  return { ...edit.finish(), change: { index, originFaction, priorServiceYears } };
}

/** Native cleanup ends the covert relationship; current membership and army remain unchanged. */
export function endSan3Infiltration(document: San3Document, index: number) {
  const { base } = context(document, index);
  const flags = document.read(base + 11, 1);
  if (
    (flags & 0x18) !== 8 ||
    (document.read(base + 8, 1) & 8) !== 0 ||
    (document.read(base + 9, 1) & 48) !== 0
  )
    throw invalid();
  const edit = draft(document);
  edit.write(base + 11, 1, flags & 0xe0);
  edit.write(base + 19, 1, 255);
  return { ...edit.finish(), change: { index, originFaction: document.read(base + 19, 1) } };
}
