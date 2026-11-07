import { createHash } from "node:crypto";
import { assertProgressManifest, type ProgressManifest } from "../domain/artifacts.ts";
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
    await this.preflight(owner, profileId, base, metadata.releaseId);
    await this.revisions.assertCapacity(owner, manifest);
    for (const [index, file] of files.entries()) {
      const stored = await this.blobs.put(file.bytes);
      const expected = manifest.artifacts[index];
      if (stored.sha256 !== expected?.sha256 || stored.size !== expected.size) {
        throw new Error("Save bytes changed during publication");
      }
    }
    // The transaction checks the head again: another request may have won meanwhile.
    return this.revisions.publish(owner, profileId, base, manifest, source);
  }

  /** Replace a native file without buffering or duplicating the other immutable blobs. */
  async replaceFile(owner: string, revisionId: string, name: string, bytes: Uint8Array) {
    const revision = await this.revisions.read(owner, revisionId);
    if (!revision.manifest.artifacts.some((artifact) => artifact.name === name))
      throw new ProgressError("not_found");
    // A stale snapshot would restore old memory over the changed native file.
    if (revision.manifest.kind === "snapshot")
      throw new Error("Extract native progress before editing a snapshot");
    await this.preflight(owner, revision.profileId, revisionId, revision.manifest.releaseId);
    const replacement = {
      name,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const manifest = {
      ...revision.manifest,
      artifacts: revision.manifest.artifacts.map((artifact) =>
        artifact.name === name ? replacement : artifact,
      ),
    };
    assertProgressManifest(manifest);
    await this.revisions.assertCapacity(owner, manifest);
    const stored = await this.blobs.put(bytes);
    if (stored.sha256 !== replacement.sha256 || stored.size !== replacement.size)
      throw new Error("Save bytes changed during publication");
    return this.revisions.publish(owner, revision.profileId, revisionId, manifest, "editor");
  }

  private async preflight(
    owner: string,
    profileId: string,
    base: string | null,
    releaseId: string,
  ) {
    // Reject unauthorized and already stale writes before creating any blobs.
    const profile = (await this.revisions.list(owner)).find((entry) => entry.id === profileId);
    if (!profile) throw new ProgressError("not_found");
    if (profile.headId !== base) throw new ProgressError("conflict");
    if (profile.releaseId !== releaseId) throw new ProgressError("release_mismatch");
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
