import { message } from "../../shared/messages.ts";
import { EditorError, type EditorView } from "../types.ts";
import { San3Document } from "./document.ts";
import { appointSan3Governor } from "./governance-governor.ts";

const invalid = () => new EditorError("invalid_edit", message("san3.invalidGovernance"));

/** Keep the selected governor as the intent; linked-list rewrites are only effects. */
export function editSan3Governors(document: San3Document, changes: Record<string, number>) {
  let current = document;
  const intents: Record<string, number> = {};
  const preview: EditorView["preview"] = [];
  for (const [key, successor] of Object.entries(changes).sort(([a], [b]) => a.localeCompare(b))) {
    const match = /^governor\.(0|[1-9]\d?)\.officer$/.exec(key);
    if (!match || !Number.isSafeInteger(successor)) throw invalid();
    const city = Number(match[1]);
    const base = current.offset("cities", city);
    current.offset("officers", successor);
    if (current.read(base + 4, 2) === successor) continue;
    const result = appointSan3Governor(current, city, successor);
    intents[key] = successor;
    const name = (index: number) =>
      index === 0xffff
        ? message("san3.none")
        : current.officer(index).name || message("san3.officerRecord", { index: index + 1 });
    const group = current.city(city).name || message("san3.cityRecord", { index: city + 1 });
    const append = (
      suffix: string,
      id: string,
      before: EditorView["preview"][number]["before"],
      after: EditorView["preview"][number]["after"],
    ) => {
      preview.push({
        key: suffix ? `governor.${city}.${suffix}` : key,
        label: message("editor.columnLabel", { group, field: message(`san3.${id}`) }),
        before,
        after,
      });
    };
    const change = result.change;
    append("", "appointGovernor", name(change.previous), name(successor));
    if (change.advisorBefore !== change.advisorAfter)
      append("advisor", "advisor", name(change.advisorBefore), name(change.advisorAfter));
    if (change.formerRoleBefore !== change.formerRoleAfter)
      append(
        "formerRole",
        "formerGovernorRole",
        message(`san3.role${change.formerRoleBefore}`),
        message(`san3.role${change.formerRoleAfter}`),
      );
    if (change.delegationBefore !== change.delegationAfter)
      append("delegation", "delegation", change.delegationBefore, change.delegationAfter);
    current = new San3Document(result.bytes);
  }
  return { bytes: current.copy(), changes: intents, preview };
}
