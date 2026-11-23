import type { EditorField } from "../../src/editors/types.ts";

/** Resolve draft-dependent controls without changing draft values or server authority. */
export function resolveEditorFields(fields: EditorField[]): EditorField[] {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  return fields.map((field) => {
    const maximum = field.maximumField ? byKey.get(field.maximumField) : undefined;
    const enabled = field.enabledByField ? byKey.get(field.enabledByField) : undefined;
    return {
      ...field,
      ...(maximum ? { max: maximum.value } : {}),
      readonly: Boolean(
        field.readonly ||
          (field.maximumField && !maximum) ||
          (field.enabledByField && !enabled?.value),
      ),
    };
  });
}
