import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";
import type { San3Document } from "./document.ts";
import { san3TaskDraft } from "./task-view.ts";

/** Relationship workflows run alone so their dependent changes cannot mask other intents. */
export function san3CampaignWorkflow(document: San3Document, changes: Record<string, number>) {
  const keys = Object.keys(changes);
  if (!keys.some((key) => key.startsWith("task."))) return undefined;
  if (keys.some((key) => !key.startsWith("task.")))
    throw new EditorError("invalid_edit", message("san3.separateWorkflow"));
  const result = san3TaskDraft(document, changes);
  return {
    bytes: result.bytes,
    edits: [],
    operationChanges: result.changes,
    operationPreview: result.preview,
  };
}
