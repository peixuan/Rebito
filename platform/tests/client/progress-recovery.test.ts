import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { createProgressRecovery } from "../../client/runtime/progress-recovery.ts";

const bytes = Uint8Array.of(1, 2);
const progress = { kind: "filesystem" as const, files: [{ name: "save.dat", bytes }] };
const profile = { id: "backup", releaseId: "game", headId: null, name: "Local copy" };
const revision = {
  id: "saved",
  manifest: {
    kind: "filesystem",
    releaseId: "game",
    artifacts: [
      { name: "save.dat", size: 2, sha256: createHash("sha256").update(bytes).digest("hex") },
    ],
  },
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => vi.unstubAllGlobals());

test("reuses the backup profile and accepts an exact committed capture after a lost response", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(json(profile))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(json({ error: "conflict" }, 409))
    .mockResolvedValueOnce(json([revision]));
  vi.stubGlobal("fetch", fetch);
  const recover = createProgressRecovery("game", "Local copy", progress);
  await expect(recover()).rejects.toThrow("offline");
  await expect(recover()).resolves.toMatchObject({ id: "backup", headId: "saved" });
  expect(fetch.mock.calls.filter(([url]) => url === "/api/profiles")).toHaveLength(1);
});

test("never treats a different backup head as successful recovery", async () => {
  const manifests = [
    { ...revision.manifest, kind: "snapshot" },
    { ...revision.manifest, releaseId: "other" },
    { ...revision.manifest, artifacts: [] },
    { ...revision.manifest, runtime: { adapter: "other" } },
    { ...revision.manifest, artifacts: [{ name: "other.dat", size: 2, sha256: "0".repeat(64) }] },
    { ...revision.manifest, artifacts: [{ name: "save.dat", size: 2, sha256: "0".repeat(64) }] },
  ];
  for (const manifest of manifests) {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(profile))
        .mockResolvedValueOnce(json({ error: "conflict" }, 409))
        .mockResolvedValueOnce(json([{ ...revision, manifest }])),
    );
    await expect(createProgressRecovery("game", "Local copy", progress)()).rejects.toMatchObject({
      status: 409,
    });
  }
});
