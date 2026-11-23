import { message } from "../../shared/messages.ts";
import { EditorError, type EditorField, type EditorView } from "../types.ts";
import { type San3Document, san3Layout } from "./document.ts";

const invalid = () => new EditorError("invalid_edit", message("editor.invalidEdit"));

/** These strategic transitions do not cancel missions, revive officers or enter battle. */
export function lifecycleFields(document: San3Document, index: number): EditorField[] {
  const base = document.offset("officers", index);
  const status = document.read(base + 9, 1);
  const infiltration = document.read(base + 11, 1);
  const origin = document.read(base + 19, 1);
  const task = document.read(base + 26, 1);
  const idle =
    document.officer(index).available &&
    (document.read(base + 8, 1) & 0x1c) === 0 &&
    (status & 0x40) === 0 &&
    (task === 0 || task === 0xff) &&
    document.read(base + 27, 1) === 0;
  return [
    {
      id: "finishRecovery",
      value: 0,
      max: 1,
      enabled: (status & 15) !== 0,
    },
    {
      id: "turncoatMonths",
      value: (status >> 4) & 3,
      max: 3,
      enabled: true,
    },
    {
      id: "endInfiltration",
      value: 0,
      max: 1,
      // Native cleanup clears bit4 too; its unverified states are not editable.
      enabled:
        (infiltration & 0x18) === 8 &&
        origin < san3Layout.factions.count &&
        origin !== document.read(base + 17, 1),
    },
  ].map(({ id, value, max, enabled }) => ({
    key: `lifecycle.${index}.${id}`,
    label: message(`san3.${id}`),
    group: message("san3.lifecycle"),
    columnId: id,
    value,
    min: 0,
    max,
    readonly: !idle || !enabled,
    ...(max === 1 ? { boolean: true } : {}),
    help: message(`san3.${id}Help`),
  }));
}

/** Apply a complete draft atomically, including the native cleanup's dependent fields. */
export function editSan3Lifecycle(document: San3Document, changes: Record<string, number>) {
  const bytes = document.copy();
  const preview: EditorView["preview"] = [];
  const intents: Record<string, number> = {};
  const touched = new Set<number>();
  const write = (offset: number, after: number) => {
    bytes[offset] = after;
    touched.add(offset);
  };
  const appendPreview = (index: number, id: string, before: number, after: number) => {
    if (before !== after)
      preview.push({
        key: `officer.${index}.${id}`,
        label: message(`san3.${id}`),
        before,
        after,
      });
  };
  for (const [key, after] of Object.entries(changes)) {
    const match =
      /^lifecycle\.(0|[1-9]\d{0,2})\.(finishRecovery|turncoatMonths|endInfiltration)$/.exec(key);
    if (!match) throw invalid();
    const index = Number(match[1]);
    const field = lifecycleFields(document, index).find((entry) => entry.key === key);
    if (!field || !Number.isSafeInteger(after) || after < 0 || after > field.max) throw invalid();
    if (after === field.value) continue;
    if (field.readonly) throw invalid();
    intents[key] = after;
    // The client retains canonical intents by preview key, not by derived effects.
    preview.push({ key, label: field.label, before: field.value, after });
    const base = document.offset("officers", index);
    if (field.columnId === "finishRecovery") {
      const before = bytes[base + 9] as number;
      appendPreview(index, "recoveryMonths", before & 7, 0);
      appendPreview(index, "recoveryState", (before >> 3) & 1, 0);
      write(base + 9, before & 0xf0);
    } else if (field.columnId === "turncoatMonths") {
      const before = bytes[base + 9] as number;
      write(base + 9, (before & 0xcf) | (after << 4));
    } else {
      const before = bytes[base + 11] as number;
      appendPreview(index, "infiltration", 1, 0);
      appendPreview(index, "infiltrationMonths", before & 7, 0);
      appendPreview(index, "originFaction", document.read(base + 19, 1), 0xff);
      write(base + 11, before & 0xe0);
      write(base + 19, 0xff);
    }
  }
  const writes: { offset: number; width: 1; before: number; after: number }[] = [];
  for (const offset of [...touched].sort((left, right) => left - right)) {
    const before = document.read(offset, 1);
    const after = bytes[offset] as number;
    if (before !== after) writes.push({ offset, width: 1, before, after });
  }
  return { bytes, writes, preview, changes: intents };
}
