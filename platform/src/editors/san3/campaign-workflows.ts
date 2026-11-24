import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import type { San3Document } from "./document.ts";
import { san3StateDraft } from "./state-view.ts";
import { san3TaskDraft } from "./task-view.ts";

import { san3TerritoryDraft } from "./territory-draft.ts";

const workflows = [
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
