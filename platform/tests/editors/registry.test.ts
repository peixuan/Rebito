import { expect, it } from "vitest";
import { koukaiAdapter } from "../../src/editors/koukai2/adapter.ts";
import { editorIds, findEditor, listEditors } from "../../src/editors/registry.ts";
import { message } from "../../src/shared/messages.ts";

it("shares installed adapters and exposes descriptive metadata without executable code", () => {
  expect(findEditor("koukai2")?.adapter).toBe(koukaiAdapter);
  expect(findEditor("constructor")).toBeUndefined();
  expect(findEditor(undefined)).toBeUndefined();
  expect(listEditors().map(({ id }) => id)).toEqual(editorIds);
  expect(listEditors()[0]).not.toHaveProperty("adapter");
  expect(listEditors()[0]?.instructions).toEqual(message("editor.koukaiDescription"));
});
