import { message } from "../../shared/messages.ts";
import { EditorError, type EditorTextField } from "../types.ts";
import { type San3Document, san3Layout } from "./document.ts";
import { createSan3NameCodec, decodeSan3Name, type San3NameKind } from "./names.ts";

function fieldOffset(index: number, kind: San3NameKind) {
  if (!Number.isInteger(index) || index < 0 || index >= san3Layout.custom.count)
    throw new EditorError("invalid_edit", message("editor.invalidEdit"));
  return san3Layout.custom.offset + index * san3Layout.custom.stride + (kind === "kanji" ? 13 : 20);
}

/** Registered and unused definitions share the same bounded name fields. */
export function customNameFields(document: San3Document, index: number): EditorTextField[] {
  const bytes = document.copy();
  return (["kanji", "kana"] as const).map((kind) => {
    const offset = fieldOffset(index, kind);
    return {
      key: `custom.${index}.${kind}`,
      label: message(`san3.${kind}`),
      value: decodeSan3Name(bytes.subarray(offset, offset + (kind === "kanji" ? 7 : 8))),
      maxLength: kind === "kanji" ? 3 : 7,
      help: message(`san3.${kind}Help`),
    };
  });
}

/** Encode the complete draft before writing; textual no-ops retain original byte aliases. */
export function editCustomNames(document: San3Document, changes: Record<string, string>) {
  const bytes = document.copy();
  const entries = Object.entries(changes);
  const codec = entries.length ? createSan3NameCodec(bytes) : undefined;
  const edits = entries.flatMap(([key, value]) => {
    const match = /^custom\.(0|[1-9]\d?)\.(kanji|kana)$/.exec(key);
    if (!match || typeof value !== "string")
      throw new EditorError("invalid_edit", message("editor.invalidEdit"));
    const index = Number(match[1]);
    const kind = match[2] as San3NameKind;
    const offset = fieldOffset(index, kind);
    const before = decodeSan3Name(bytes.subarray(offset, offset + (kind === "kanji" ? 7 : 8)));
    if (value === before) return [];
    const encoded = codec?.encode(kind, value);
    if (!encoded) throw new EditorError("invalid_edit", message("editor.invalidEdit"));
    const after = decodeSan3Name(encoded);
    if (after === before) return [];
    return [{ key, index, kind, offset, encoded, before, after }];
  });
  for (const edit of edits) bytes.set(edit.encoded, edit.offset);
  return { bytes, edits };
}
