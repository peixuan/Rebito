import type { LocalLibrary } from "../library/catalog.ts";
import type { SaveService } from "../saves/service.ts";
import { message } from "../shared/messages.ts";
import { bindGameData } from "./game-data.ts";
import { findEditor } from "./registry.ts";
import { assertSnapshotBinding } from "./snapshots/binding.ts";
import { openSnapshotMemory } from "./snapshots/memory.ts";
import { type EditorDraft, EditorError } from "./types.ts";

export interface EditorQuery extends EditorDraft {
  file?: string | undefined;
}
export interface EditorBatch {
  files: { file: string; edits: { slot: number; changes: Record<string, number> }[] }[];
}

/** Release configuration selects the adapter; clients cannot choose a binary parser. */
export class EditorService {
  private readonly saves: SaveService;
  private readonly library: LocalLibrary;
  constructor(saves: SaveService, library: LocalLibrary) {
    this.saves = saves;
    this.library = library;
  }

  private async open(owner: string, revisionId: string, file?: string) {
    const revision = await this.saves.revisions.read(owner, revisionId);
    // Another server instance may have removed the association since our last request.
    await this.library.refresh();
    const game = this.library.get(revision.manifest.releaseId);
    const registration = findEditor(game?.editor);
    if (!registration || !game || registration.system !== game.system)
      throw new EditorError("unsupported_editor", message("editor.unsupported"));
    const adapter = registration.adapter;
    if (registration.snapshot) {
      if (revision.manifest.kind !== "snapshot")
        throw new EditorError("no_editable_save", message("editor.saveRequired"));
      assertSnapshotBinding(revision.manifest.runtime, registration.snapshot);
      const name = "__runtime/state.bin";
      if (
        (file && file !== name) ||
        !revision.manifest.artifacts.some((entry) => entry.name === name)
      )
        throw new EditorError("no_editable_save", message("editor.saveRequired"));
      const memory = openSnapshotMemory(
        await this.saves.file(owner, revisionId, name),
        registration.snapshot.core,
        registration.snapshot.domain,
      );
      if (memory.bytes.length !== adapter.size)
        throw new EditorError("invalid_save", message("editor.invalidSave"));
      return {
        adapter: await bindGameData(this.library, game, registration),
        instructions: registration.instructions,
        file: name,
        files: [name],
        bytes: memory.bytes,
        replaceState: memory.replace,
      };
    }
    if (revision.manifest.kind === "snapshot")
      throw new EditorError("unsupported_editor", message("editor.unsupported"));
    const paths = new Set(game.saveFiles.map((name) => name.normalize("NFC").toLowerCase()));
    const files = revision.manifest.artifacts
      .filter(
        (artifact) =>
          artifact.size === adapter.size &&
          paths.has(artifact.name.normalize("NFC").toLowerCase()) &&
          (adapter.acceptsFile?.(artifact.name) ?? true),
      )
      .map((artifact) => artifact.name);
    const selected = file ?? files[0];
    if (!selected || !files.includes(selected))
      throw new EditorError("no_editable_save", message("editor.saveRequired"));
    return {
      adapter,
      instructions: registration.instructions,
      files,
      file: selected,
      bytes: await this.saves.file(owner, revisionId, selected),
      replaceState: undefined,
    };
  }
  async preview(owner: string, revisionId: string, query: EditorQuery) {
    const opened = await this.open(owner, revisionId, query.file);
    return {
      file: opened.file,
      files: opened.files,
      instructions: opened.instructions,
      ...opened.adapter.view(opened.bytes, query),
    };
  }
  async publish(owner: string, revisionId: string, batch: EditorBatch) {
    const files = [];
    let state: Uint8Array | undefined;
    // Transform every slot of every member before publishing the group once.
    for (const entry of batch.files) {
      const opened = await this.open(owner, revisionId, entry.file);
      let bytes = opened.bytes;
      for (const edit of entry.edits) bytes = opened.adapter.apply(bytes, edit);
      if (opened.replaceState) {
        if (batch.files.length !== 1)
          throw new EditorError("invalid_edit", message("editor.invalidEdit"));
        state = opened.replaceState(bytes);
      }
      files.push({ name: opened.file, bytes });
    }
    return state
      ? this.saves.replaceSnapshot(owner, revisionId, state)
      : this.saves.replaceFiles(owner, revisionId, files);
  }
}
export type EditorResponse = Awaited<ReturnType<EditorService["preview"]>>;
