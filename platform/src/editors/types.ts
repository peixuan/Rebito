import { type DisplayMessage, type DisplayText, MessageError } from "../shared/messages.ts";

/** UI contract shared by editor adapters. It contains no binary offsets or disk paths. */
export interface EditorField {
  key: string;
  label: DisplayText;
  group: DisplayText;
  columnId: string;
  value: number;
  min: number;
  max: number;
  choices?: { value: number; label: DisplayText }[];
  boolean?: boolean;
  readonly?: boolean;
  multiplier?: number;
  divisor?: number;
  help?: DisplayText;
}
export interface EditorDraft {
  slot?: number;
  module?: string;
  record?: string;
  changes?: Record<string, number>;
  action?: { id: string; record: string };
}
export interface EditorView {
  slots: { index: number; label: DisplayText; available: boolean }[];
  slot: number;
  modules: { id: string; label: DisplayText }[];
  module: string;
  columns: { id: string; label: DisplayText }[];
  records: {
    id: string;
    label: DisplayText;
    summary: DisplayText;
    tags: string[];
    available: boolean;
    cells: Record<string, number | DisplayText>;
  }[];
  selected: string;
  fields: EditorField[];
  actions: { id: string; label: DisplayText; help?: DisplayText }[];
  changes: Record<string, number>;
  preview: { key: string; label: DisplayText; before: number; after: number }[];
}
export interface EditorAdapter {
  size: number;
  view(bytes: Uint8Array, draft: EditorDraft): EditorView;
  apply(bytes: Uint8Array, draft: EditorDraft): Uint8Array;
}
export class EditorError extends MessageError {
  readonly code:
    | "invalid_save"
    | "invalid_edit"
    | "unsupported_editor"
    | "no_editable_save"
    | "no_changes";
  constructor(code: EditorError["code"], message: DisplayMessage) {
    super(message);
    this.code = code;
  }
}
