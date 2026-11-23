import type { EditorField, EditorView } from "../../src/editors/types.ts";

/** Drop semantic no-ops without converting derived preview effects into writable changes. */
export function previewedEditorChanges(view: Pick<EditorView, "changes" | "preview">) {
  const changed = new Set(view.preview.map(({ key }) => key));
  return Object.fromEntries(Object.entries(view.changes).filter(([key]) => changed.has(key)));
}

/** Resolve draft-dependent controls without changing draft values or server authority. */
export function resolveEditorFields(
  fields: EditorField[],
  changes: Record<string, number> = {},
): EditorField[] {
  const values = fields.map((field) => ({ ...field, value: changes[field.key] ?? field.value }));
  const byKey = new Map(values.map((field) => [field.key, field]));
  return values.map((field) => {
    const maximum = field.maximumField ? byKey.get(field.maximumField) : undefined;
    const enabled = field.enabledByField ? byKey.get(field.enabledByField) : undefined;
    const link = field.derivedFrom;
    const base = link ? byKey.get(link.key) : undefined;
    let value = field.value;
    if (link && base && Object.hasOwn(changes, link.key)) {
      value = base.value + link.offset;
      if (link.modulus) value = ((value % link.modulus) + link.modulus) % link.modulus;
    }
    return {
      ...field,
      value,
      ...(maximum ? { max: maximum.value } : {}),
      readonly: Boolean(
        field.readonly ||
          (link && (!base || base.readonly)) ||
          (field.maximumField && !maximum) ||
          (field.enabledByField && !enabled?.value),
      ),
    };
  });
}

/** Last edited control wins locally; canonical server checks still reject inconsistent API drafts. */
export function changeEditorField(
  fields: EditorField[],
  changes: Record<string, number>,
  key: string,
  value: number,
) {
  const field = resolveEditorFields(fields, changes).find((entry) => entry.key === key);
  if (!field || field.readonly) return { ...changes };
  const next = { ...changes, [key]: value };
  if (field.derivedFrom) next[field.derivedFrom.key] = value - field.derivedFrom.offset;
  else for (const target of fields) if (target.derivedFrom?.key === key) delete next[target.key];
  return next;
}
