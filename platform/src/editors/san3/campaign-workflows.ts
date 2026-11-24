import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import { editSan3Appearance } from "./appearance-view.ts";
import { editSan3Delegation } from "./city-delegation.ts";
import { San3Document, san3Layout } from "./document.ts";
import { editSan3FactionControl } from "./faction-control.ts";
import { editSan3, findSan3Field } from "./fields.ts";
import { san3InfiltrationDraft } from "./infiltration-view.ts";
import { editSan3Life } from "./life-controls.ts";
import { san3MergeDraft } from "./merge-view.ts";
import { editSan3Presence } from "./presence-controls.ts";
import { editSan3Shipbuilding } from "./shipbuilding.ts";
import { san3StateDraft } from "./state-view.ts";
import { san3TaskDraft } from "./task-view.ts";
import { san3TerritoryDraft } from "./territory-draft.ts";

const workflows = [
  { prefix: "factionControl.", edit: editSan3FactionControl },
  { prefix: "delegation.", edit: editSan3Delegation },
  { prefix: "merge.", edit: san3MergeDraft },
  { prefix: "shipbuilding.", edit: editSan3Shipbuilding },
  { prefix: "presence.", edit: editSan3Presence },
  { prefix: "appearance.", edit: editSan3Appearance },
  { prefix: "life.", edit: editSan3Life },
  { prefix: "infiltration.", edit: san3InfiltrationDraft },
  { prefix: "ownership.", edit: san3TerritoryDraft },
  { prefix: "task.", edit: san3TaskDraft },
  { prefix: "state.", edit: san3StateDraft },
];

/** Definitions may accompany custom placement; unrelated relationship intents stay separate. */
export function san3CampaignWorkflow(document: San3Document, changes: Record<string, number>) {
  const keys = Object.keys(changes);
  const workflow = workflows.find(({ prefix }) => keys.some((key) => key.startsWith(prefix)));
  if (!workflow) return undefined;
  const definitions: Record<string, number> = {};
  const intents: Record<string, number> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (key.startsWith(workflow.prefix)) {
      intents[key] = value;
      continue;
    }
    if (workflow.prefix !== "presence." && workflow.prefix !== "appearance.")
      throw new EditorError("invalid_edit", message("san3.separateWorkflow"));
    const field = findSan3Field(document, key, changes);
    if (
      field.offset < san3Layout.custom.offset ||
      field.offset >= san3Layout.custom.offset + san3Layout.custom.count * san3Layout.custom.stride
    )
      throw new EditorError("invalid_edit", message("san3.separateWorkflow"));
    definitions[key] = value;
  }
  const edited = editSan3(document, definitions);
  const definitionDocument = new San3Document(edited.bytes);
  const result = workflow.edit(definitionDocument, intents);
  return {
    bytes: result.bytes,
    edits: edited.edits,
    definitionDocument,
    operationChanges: result.changes,
    operationPreview: result.preview,
  };
}
