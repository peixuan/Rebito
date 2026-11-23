import { message } from "../../shared/messages.ts";
import { EditorError, type EditorView } from "../types.ts";
import { appointSan3Officer } from "./appointments.ts";
import { San3Document } from "./document.ts";

/** Group role and advisor intents before validation; never publish independent pointer writes. */
export function editSan3Appointments(document: San3Document, draft: Record<string, number>) {
  const invalid = () => new EditorError("invalid_edit", message("san3.invalidAppointment"));
  const requests = new Map<number, { role: number; advisor: number }>();
  for (const [key, value] of Object.entries(draft)) {
    const match = /^appointment\.(0|[1-9]\d{0,2})\.(role|advisor)$/.exec(key);
    if (!match || !Number.isSafeInteger(value)) throw invalid();
    const index = Number(match[1]);
    const original = document.officer(index);
    const request = requests.get(index) ?? { role: original.role, advisor: 0 };
    if (match[2] === "role") {
      if (value < 1 || value > 4) throw invalid();
      request.role = value;
    } else {
      if (value !== 0 && value !== 1) throw invalid();
      request.advisor = value;
    }
    requests.set(index, request);
  }
  let current = document;
  const changes: Record<string, number> = {};
  const preview: EditorView["preview"] = [];
  const advisedCities = new Set<number>();
  const name = (index: number) =>
    index === 0xffff
      ? message("san3.none")
      : document.officer(index).name || message("san3.officerRecord", { index: index + 1 });
  for (const [index, request] of [...requests].sort(([a], [b]) => a - b)) {
    const officer = current.officer(index);
    const alreadyAdvisor =
      officer.city < 46 && current.read(current.offset("cities", officer.city) + 10, 2) === index;
    if (request.advisor && request.role !== 1) throw invalid();
    if (request.advisor) {
      if (advisedCities.has(officer.city)) throw invalid();
      advisedCities.add(officer.city);
    }
    if (request.role === officer.role && (!request.advisor || alreadyAdvisor)) continue;
    const result = appointSan3Officer(current, index, request.role, Boolean(request.advisor));
    const change = result.change;
    if (change.before !== change.after) {
      changes[`appointment.${index}.role`] = request.role;
      preview.push({
        key: `appointment.${index}.role`,
        label: message("editor.columnLabel", { group: name(index), field: message("san3.role") }),
        before: message(`san3.role${change.before}`),
        after: message(`san3.role${change.after}`),
      });
    }
    if (request.advisor) changes[`appointment.${index}.advisor`] = 1;
    if (change.advisorBefore !== change.advisorAfter)
      preview.push({
        key: `appointment.${index}.advisor`,
        label: message("editor.columnLabel", {
          group:
            current.city(change.city).name ||
            message("san3.cityRecord", { index: change.city + 1 }),
          field: message("san3.advisor"),
        }),
        before: name(change.advisorBefore),
        after: name(change.advisorAfter),
      });
    current = new San3Document(result.bytes);
  }
  return { bytes: current.copy(), changes, preview };
}
