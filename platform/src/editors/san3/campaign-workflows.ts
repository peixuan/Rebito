import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import { editSan3Delegation } from "./city-delegation.ts";
import type { San3Document } from "./document.ts";
import { editSan3FactionControl } from "./faction-control.ts";
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
  { prefix: "life.", edit: editSan3Life },
  { prefix: "infiltration.", edit: san3InfiltrationDraft },
  { prefix: "ownership.", edit: san3TerritoryDraft },
  { prefix: "task.", edit: san3TaskDraft },
  { prefix: "state.", edit: san3StateDraft },
];

/** Relationship workflows run alone so their dependent changes cannot mask other intents. */
export function san3CampaignWorkflow(document: San3Document, changes: Record<string, number>) {
  const keys = Object.keys(changes);
  const workflow = workflows.find(({ prefix }) => keys.some((key) => key.startsWith(prefix)));
  if (!workflow) return undefined;
  if (keys.some((key) => !key.startsWith(workflow.prefix)))
    throw new EditorError("invalid_edit", message("san3.separateWorkflow"));
  const result = workflow.edit(document, changes);
  return {
    bytes: result.bytes,
    edits: [],
    operationChanges: result.changes,
    operationPreview: result.preview,
  };
}
