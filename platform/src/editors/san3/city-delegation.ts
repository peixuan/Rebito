import { message } from "../../shared/messages.ts";
import type { EditorField } from "../types.ts";
import type { San3Document } from "./document.ts";
import { inspectSan3Governance, invalidGovernance } from "./governance-core.ts";
import { san3OperationLabels, san3OperationPreview } from "./operation-preview.ts";

function modes(document: San3Document, index: number): number[] {
  const base = document.offset("cities", index);
  const city = inspectSan3Governance(document).cities[index];
  const governor = city?.serving[0];
  if (
    !city ||
    city.faction === 255 ||
    governor === undefined ||
    document.read(0x7dc2a, 4) === base ||
    (document.read(base + 22, 1) & 0x41) !== 0
  )
    throw invalidGovernance();
  const officer = document.offset("officers", governor);
  const role = document.read(officer + 12, 1);
  if (role > 4 || (document.read(officer + 8, 1) & 0x14) !== 0) throw invalidGovernance();
  // Native governors with military/civil roles cannot administer a city directly.
  return role >= 3 ? [1, 2, 3] : [0, 1, 2, 3];
}

/** Keep the current mode visible even when a running command prevents a change. */
export function san3DelegationFields(document: San3Document, index: number): EditorField[] {
  const value = document.read(document.offset("cities", index) + 23, 1) & 3;
  let options: number[] = [];
  try {
    options = modes(document, index);
  } catch {
    /* Invalid relationship graphs must not prevent unrelated scalar inspection. */
  }
  return [
    {
      key: `delegation.${index}.mode`,
      columnId: "delegationMode",
      label: message("san3.delegationMode"),
      group: message("san3.cityEconomy"),
      help: message("san3.delegationHelp"),
      value,
      min: 0,
      max: 3,
      readonly: options.length === 0,
      choices: [...new Set([value, ...options])].map((mode) => ({
        value: mode,
        label: message(`san3.delegation${mode}`),
      })),
    },
  ];
}

/** Native delegation changes only the low two city flag bits; no army is reallocated. */
export function editSan3Delegation(document: San3Document, changes: Record<string, number>) {
  const bytes = document.copy();
  const names = san3OperationLabels(document);
  const { append, preview } = san3OperationPreview();
  const intents: Record<string, number> = {};
  const writes: { offset: number; width: 1; before: number; after: number }[] = [];
  for (const [key, value] of Object.entries(changes)) {
    const match = /^delegation\.(0|[1-9]\d?)\.mode$/.exec(key);
    if (!match || !Number.isSafeInteger(value) || value < 0 || value > 3) throw invalidGovernance();
    const index = Number(match[1]);
    const offset = document.offset("cities", index) + 23;
    const before = document.read(offset, 1);
    if (value === (before & 3)) continue;
    if (!modes(document, index).includes(value)) throw invalidGovernance();
    const after = (before & 0xfc) | value;
    bytes[offset] = after;
    writes.push({ offset, width: 1, before, after });
    intents[key] = value;
    append(
      key,
      names.city(index),
      "delegationMode",
      message(`san3.delegation${before & 3}`),
      message(`san3.delegation${value}`),
    );
  }
  return { bytes, changes: intents, preview, writes: writes.sort((a, b) => a.offset - b.offset) };
}
