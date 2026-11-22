import type { DisplayText } from "../shared/messages.ts";
import { jinyongRegistration } from "./jinyong/registration.ts";
import { koukaiRegistration } from "./koukai2/registration.ts";
import type { EditorAdapter } from "./types.ts";

export interface EditorRegistration {
  readonly label: DisplayText;
  readonly system: "dos";
  readonly instructions: DisplayText;
  readonly adapter: EditorAdapter;
}

export const editorIds = ["koukai2", "jinyong"] as const;
const registrations: Readonly<Record<(typeof editorIds)[number], EditorRegistration>> = {
  koukai2: koukaiRegistration,
  jinyong: jinyongRegistration,
};

/** Installed adapters and administration labels; association is an operator decision. */
export function findEditor(id: string | undefined): EditorRegistration | undefined {
  return id && Object.hasOwn(registrations, id)
    ? registrations[id as (typeof editorIds)[number]]
    : undefined;
}

export function listEditors() {
  return editorIds.map((id) => {
    const registration = registrations[id];
    return {
      id,
      label: registration.label,
      system: registration.system,
      instructions: registration.instructions,
    };
  });
}
