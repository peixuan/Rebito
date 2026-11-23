import { message } from "../../shared/messages.ts";
import { EditorError, type EditorField } from "../types.ts";
import { san3AppointmentOptions } from "./appointments.ts";
import type { San3Document } from "./document.ts";

/** Pending advisor intent stays cancellable after the preview has filled the seat. */
export function san3AppointmentFields(
  document: San3Document,
  index: number,
  pendingAdvisor = 0,
): EditorField[] {
  const role = document.read(document.offset("officers", index) + 12, 1);
  let options: ReturnType<typeof san3AppointmentOptions> = { roles: [], canAdvise: false };
  try {
    options = san3AppointmentOptions(document, index);
  } catch (error) {
    if (!(error instanceof EditorError)) throw error;
    // Invalid relationships must not block unrelated scalar inspection.
  }
  const group = message("san3.appointments");
  return [
    {
      key: `appointment.${index}.role`,
      columnId: "appointmentRole",
      label: message("san3.role"),
      group,
      value: role,
      min: 0,
      max: Math.max(4, role),
      choices: [...new Set([role, ...options.roles])].map((value) => ({
        value,
        label: value <= 6 ? message(`san3.role${value}`) : message("san3.inactive"),
      })),
      readonly: !options.roles.some((value) => value !== role),
      help: message("san3.appointmentHelp"),
    },
    {
      key: `appointment.${index}.advisor`,
      columnId: "appointAdvisor",
      label: message("san3.appointAdvisor"),
      group,
      value: pendingAdvisor === 1 ? 1 : 0,
      min: 0,
      max: 1,
      boolean: true,
      readonly: pendingAdvisor !== 1 && (role !== 1 || !options.canAdvise),
      help: message("san3.appointAdvisorHelp"),
    },
  ];
}
