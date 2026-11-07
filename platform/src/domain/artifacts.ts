/** Logical names are portable save paths, never paths into the server filesystem. */
export interface ArtifactRef {
  readonly name: string;
  readonly sha256: string;
  readonly size: number;
}

export type ProgressKind = "game-save" | "snapshot" | "filesystem";

export interface RuntimeIdentity {
  readonly adapter: string;
  readonly core: string;
  readonly version: string;
}

export interface ProgressManifest {
  readonly kind: ProgressKind;
  readonly releaseId: string;
  readonly artifacts: readonly ArtifactRef[];
  readonly runtime?: RuntimeIdentity;
}

export const progressLimits = { files: 128, bytes: 64 * 1024 * 1024 } as const;

export function assertArtifactName(name: string): void {
  if (
    name.length === 0 ||
    name.length > 240 ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Control bytes are deliberately rejected in file names.
    /[\\:*?"<>|\x00-\x1f\x7f]/.test(name) ||
    name
      .split("/")
      .some(
        (part) =>
          part === "" ||
          part === "." ||
          part === ".." ||
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      )
  ) {
    throw new Error("Artifact name must be a portable relative path");
  }
}

/** Validate a complete collection before persisting any revision metadata. */
export function assertProgressManifest(manifest: ProgressManifest): void {
  if (!["game-save", "snapshot", "filesystem"].includes(manifest.kind)) {
    throw new Error("Unsupported progress kind");
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,95}$/.test(manifest.releaseId)) {
    throw new Error("Invalid game release identifier");
  }
  if (manifest.artifacts.length === 0 || manifest.artifacts.length > progressLimits.files) {
    throw new Error("Invalid artifact count");
  }
  if (manifest.kind === "snapshot" && !manifest.runtime) {
    throw new Error("Snapshots require a runtime identity");
  }
  if (
    manifest.runtime &&
    [manifest.runtime.adapter, manifest.runtime.core, manifest.runtime.version].some(
      (value) => typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,95}$/.test(value),
    )
  ) {
    throw new Error("Invalid runtime identity");
  }

  const names = new Set<string>();
  let total = 0;
  for (const artifact of manifest.artifacts) {
    assertArtifactName(artifact.name);
    const key = artifact.name.normalize("NFC").toLowerCase();
    if (names.has(key)) throw new Error("Ambiguous artifact names");
    names.add(key);
    if (!/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error("Invalid artifact digest");
    if (!Number.isSafeInteger(artifact.size) || artifact.size < 0) {
      throw new Error("Invalid artifact size");
    }
    total += artifact.size;
    if (total > progressLimits.bytes) throw new Error("Progress exceeds storage limit");
  }
  for (const name of names) {
    const parts = name.split("/");
    parts.pop();
    while (parts.length > 0) {
      if (names.has(parts.join("/"))) throw new Error("Artifact is both a file and directory");
      parts.pop();
    }
  }
}
