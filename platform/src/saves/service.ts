import { createHash } from "node:crypto";
import {
  type ArtifactRef,
  assertProgressManifest,
  type ProgressManifest,
} from "../domain/artifacts.ts";
import type { LocalBlobStore } from "../storage/blobs.ts";
import {
  ProgressError,
  type RevisionRepository,
  type RevisionSource,
} from "../storage/revisions.ts";

export interface SaveFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}
export type SaveMetadata = Omit<ProgressManifest, "artifacts">;

/** The only publication path shared by imports, emulator saves, edits and restores. */
export class SaveService {
  readonly revisions: RevisionRepository;
  private readonly blobs: LocalBlobStore;
  constructor(revisions: RevisionRepository, blobs: LocalBlobStore) {
    this.revisions = revisions;
    this.blobs = blobs;
  }

  async publish(
    owner: string,
    profileId: string,
    base: string | null,
    metadata: SaveMetadata,
    files: readonly SaveFile[],
    source: RevisionSource,
    backup = false,
  ) {
    const manifest: ProgressManifest = {
      ...metadata,
      artifacts: files.map(({ name, bytes }) => ({
        name,
        size: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      })),
    };
    assertProgressManifest(manifest);
    await this.revisions.assertCapacity(owner, profileId, base, manifest);
    await this.storeFiles(owner, files, manifest.artifacts);
    // The transaction checks the head again: another request may have won meanwhile.
    return this.revisions.publish(owner, profileId, base, manifest, source, backup);
  }

  /** Publish a whole edit group once, reusing all unchanged immutable blobs. */
  async replaceFiles(owner: string, revisionId: string, files: readonly SaveFile[]) {
    return this.replaceArtifacts(owner, revisionId, files, false);
  }

  /** A verified state transform preserves its native saves and runtime identity. */
  async replaceSnapshot(owner: string, revisionId: string, bytes: Uint8Array) {
    return this.replaceArtifacts(owner, revisionId, [{ name: "__runtime/state.bin", bytes }], true);
  }

  private async replaceArtifacts(
    owner: string,
    revisionId: string,
    files: readonly SaveFile[],
    snapshot: boolean,
  ) {
    const revision = await this.revisions.read(owner, revisionId);
    if (!files.length || new Set(files.map((file) => file.name)).size !== files.length)
      throw new Error("Empty or duplicate replacement files");
    if (
      files.some(
        (file) => !revision.manifest.artifacts.some((artifact) => artifact.name === file.name),
      )
    )
      throw new ProgressError("not_found");
    // A stale snapshot would restore old memory over the changed native file.
    if ((revision.manifest.kind === "snapshot") !== snapshot)
      throw new Error("Use the matching native or snapshot editing path");
    const replacements = files.map(({ name, bytes }) => ({
      name,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }));
    const manifest = {
      ...revision.manifest,
      artifacts: revision.manifest.artifacts.map(
        (artifact) =>
          replacements.find((replacement) => replacement.name === artifact.name) ?? artifact,
      ),
    };
    assertProgressManifest(manifest);
    await this.revisions.assertCapacity(owner, revision.profileId, revisionId, manifest);
    await this.storeFiles(owner, files, replacements);
    return this.revisions.publish(owner, revision.profileId, revisionId, manifest, "editor");
  }

  private async storeFiles(
    owner: string,
    files: readonly SaveFile[],
    artifacts: readonly ArtifactRef[],
  ) {
    await this.revisions.trackPendingFiles(owner, artifacts);
    for (const [index, file] of files.entries()) {
      const stored = await this.blobs.put(file.bytes);
      const expected = artifacts[index];
      if (stored.sha256 !== expected?.sha256 || stored.size !== expected.size)
        throw new Error("Save bytes changed during publication");
    }
  }

  async file(owner: string, revisionId: string, name: string): Promise<Uint8Array> {
    const revision = await this.revisions.read(owner, revisionId);
    const artifact = revision.manifest.artifacts.find((entry) => entry.name === name);
    if (!artifact) throw new ProgressError("not_found");
    return this.blobs.read(artifact);
  }

  async restore(owner: string, profileId: string, base: string | null, revisionId: string) {
    const revision = await this.revisions.read(owner, revisionId);
    if (revision.profileId !== profileId) throw new ProgressError("not_found");
    for (const artifact of revision.manifest.artifacts) await this.blobs.read(artifact);
    return this.revisions.publish(owner, profileId, base, revision.manifest, "restore");
  }
}
