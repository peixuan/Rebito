import { message } from "../shared/messages.ts";
import { type EditorAdapter, EditorError } from "./types.ts";

/** Resolve one complete native group without guessing companions from file size. */
export function nativeFileGroup(
  adapter: EditorAdapter,
  selected: string,
  declared: readonly string[],
  artifacts: readonly { name: string; size: number }[],
): string[] {
  const normalize = (name: string) => name.normalize("NFC").toLowerCase();
  const required = [
    { name: selected, size: adapter.size },
    ...(adapter.requiredFiles?.(selected) ?? []),
  ];
  const names = required.map((member) => {
    const name = normalize(member.name);
    const matches = artifacts.filter((artifact) => normalize(artifact.name) === name);
    if (declared.filter((entry) => normalize(entry) === name).length !== 1 || matches.length !== 1)
      throw new EditorError("no_editable_save", message("editor.saveRequired"));
    const artifact = matches[0];
    if (!artifact || (member.size !== undefined && artifact.size !== member.size))
      throw new EditorError("invalid_save", message("editor.invalidSave"));
    return artifact.name;
  });
  return [...new Set(names)];
}
