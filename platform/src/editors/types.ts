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
  /** Another visible field supplies the maximum while a draft is being edited. */
  maximumField?: string;
  /** A zero selection in this visible field disables the dependent control. */
  enabledByField?: string;
  /** Read-only computed value linked to a visible base for live draft previews. */
  derivedFrom?: { key: string; offset: number; modulus?: number };
  multiplier?: number;
  divisor?: number;
  help?: DisplayText;
}
export interface EditorDraft {
  slot?: number | undefined;
  module?: string | undefined;
  record?: string | undefined;
  changes?: Record<string, number> | undefined;
  textChanges?: Record<string, string> | undefined;
  action?: { id: string; record: string } | undefined;
}
/** Text uses adapter-owned encoding and validation; it is never a raw byte write. */
export interface EditorTextField {
  key: string;
  label: DisplayText;
  value: string;
  maxLength: number;
  readonly?: boolean;
  help?: DisplayText;
}
export interface EditorView {
  slots: { index: number; label: DisplayText; available: boolean }[];
  slot: number;
  modules: { id: string; label: DisplayText }[];
  module: string;
  columns: { id: string; label: DisplayText; defaultVisible?: boolean }[];
  filter?: { tag: string; label: DisplayText; defaultEnabled?: boolean };
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
  textFields?: EditorTextField[];
  actions: { id: string; label: DisplayText; help?: DisplayText }[];
  /** Writable intents; preview may also include derived read-only effects. */
  changes: Record<string, number>;
  textChanges?: Record<string, string>;
  preview: {
    key: string;
    label: DisplayText;
    before: number | DisplayText;
    after: number | DisplayText;
  }[];
}
export interface EditorAdapter {
  size: number;
  supportsText?: boolean;
  /** Optional native filename boundary for formats also used by game resources. */
  acceptsFile?(name: string): boolean;
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
