import type { DisplayText } from "../shared/messages.ts";
import { jinyongRegistration } from "./jinyong/registration.ts";
import { koukaiRegistration } from "./koukai2/registration.ts";
import { phantasyStar4Registration } from "./phantasy-star4/registration.ts";
import { san3Registration } from "./san3/registration.ts";
import type { SnapshotBinding } from "./snapshots/binding.ts";
import type { EditorAdapter } from "./types.ts";

export type EditorRegistration = {
  readonly label: DisplayText;
  readonly instructions: DisplayText;
  readonly adapter: EditorAdapter;
} & (
  | { readonly system: "dos"; readonly snapshot?: never }
  | { readonly system: "md" | "segacd"; readonly snapshot: SnapshotBinding }
);

export const editorIds = ["koukai2", "jinyong", "phantasy-star4", "san3"] as const;
const registrations: Readonly<Record<(typeof editorIds)[number], EditorRegistration>> = {
  koukai2: koukaiRegistration,
  jinyong: jinyongRegistration,
  "phantasy-star4": phantasyStar4Registration,
  san3: san3Registration,
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
