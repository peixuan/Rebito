import { describe, expect, it } from "vitest";
import {
  assertArtifactName,
  assertProgressManifest,
  type ProgressManifest,
} from "../../src/domain/artifacts.ts";

const artifact = { name: "KOUKAI2.DAT", sha256: "a".repeat(64), size: 328991 };
const save: ProgressManifest = {
  kind: "game-save",
  releaseId: "koukai2-pc",
  artifacts: [artifact],
};

describe("progress collections", () => {
  it("accepts native saves and multi-file writable data without a slot assumption", () => {
    expect(() => assertProgressManifest(save)).not.toThrow();
    expect(() =>
      assertProgressManifest({
        ...save,
        kind: "filesystem",
        artifacts: [
          ...save.artifacts,
          { name: "CONFIG/OPTIONS.INI", sha256: "b".repeat(64), size: 0 },
        ],
      }),
    ).not.toThrow();
  });

  it("requires a complete versioned runtime for snapshots", () => {
    expect(() => assertProgressManifest({ ...save, kind: "snapshot" })).toThrow("runtime identity");
    expect(() =>
      assertProgressManifest({
        ...save,
        kind: "snapshot",
        runtime: { adapter: "emulatorjs", core: "mgba", version: "test-1" },
      }),
    ).not.toThrow();
    expect(() =>
      assertProgressManifest({
        ...save,
        runtime: { adapter: "emulatorjs", core: "", version: "test-1" },
      }),
    ).toThrow("runtime identity");
    expect(() =>
      assertProgressManifest({ ...save, runtime: {} as NonNullable<ProgressManifest["runtime"]> }),
    ).toThrow("runtime identity");
  });

  it.each([
    "",
    "/absolute",
    "../escape",
    "a/../b",
    "a/./b",
    "a//b",
    "C:/save",
    "a\\b",
    "bad\0name",
    "a. ",
    "a?.sav",
    "CON.sav",
    "aux/file",
    "x".repeat(241),
  ])("rejects unsafe or ambiguous path %j", (name) => {
    expect(() => assertArtifactName(name)).toThrow("relative path");
  });

  it("rejects case and Unicode aliases in the same collection", () => {
    for (const [first, second] of [
      ["Save.DAT", "save.dat"],
      ["é.sav", "e\u0301.sav"],
    ] as const) {
      expect(() =>
        assertProgressManifest({
          ...save,
          artifacts: [
            { name: first, sha256: "a".repeat(64), size: 1 },
            { name: second, sha256: "b".repeat(64), size: 1 },
          ],
        }),
      ).toThrow("Ambiguous");
    }
  });

  it("rejects unsupported kinds, bad release IDs and empty or huge collections", () => {
    for (const manifest of [
      { ...save, kind: "unknown" as ProgressManifest["kind"] },
      { ...save, releaseId: "../other" },
      { ...save, artifacts: [] },
      { ...save, artifacts: Array.from({ length: 129 }, () => artifact) },
    ])
      expect(() => assertProgressManifest(manifest)).toThrow();
  });

  it("rejects file/directory collisions independently of artifact order", () => {
    const artifacts = [
      { ...artifact, name: "config/options/file" },
      { ...artifact, name: "CONFIG" },
    ];
    for (const order of [artifacts, [...artifacts].reverse()]) {
      expect(() => assertProgressManifest({ ...save, artifacts: order })).toThrow("directory");
    }
  });

  it("checks hashes, exact sizes and the total collection budget", () => {
    for (const change of [
      { sha256: "not-a-digest" },
      { size: -1 },
      { size: 1.5 },
      { size: Number.MAX_SAFE_INTEGER + 1 },
      { size: 64 * 1024 * 1024 + 1 },
    ]) {
      expect(() =>
        assertProgressManifest({ ...save, artifacts: [{ ...artifact, ...change }] }),
      ).toThrow();
    }
  });
});
