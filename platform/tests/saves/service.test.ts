import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateIdentity } from "../../src/identity/migrate.ts";
import { SaveService } from "../../src/saves/service.ts";
import { loadConfig } from "../../src/server/config.ts";
import { LocalBlobStore } from "../../src/storage/blobs.ts";
import { RevisionRepository } from "../../src/storage/revisions.ts";
import { migrateStorage } from "../../src/storage/schema.ts";
import { testDatabase } from "../database.ts";

describe("save publication service", () => {
  let fixture: Awaited<ReturnType<typeof testDatabase>>;
  let directory: string;
  let repository: RevisionRepository;
  let blobs: LocalBlobStore;
  let service: SaveService;
  const metadata = { kind: "game-save", releaseId: "test-game" } as const;
  const files = [{ name: "SAVE.DAT", bytes: Uint8Array.of(1, 2, 3) }];
  beforeAll(async () => {
    fixture = await testDatabase();
    directory = await mkdtemp(join(tmpdir(), "retro-service-"));
    const config = loadConfig({
      APP_ORIGIN: "http://localhost:3000",
      DATABASE_URL: "postgresql://unused/unused",
      AUTH_SECRET: randomBytes(32).toString("hex"),
    });
    await migrateIdentity(config, fixture.database);
    await migrateStorage(fixture.database);
    await fixture.database.query(
      `INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES ('alice','Alice','alice@example.test',false,now(),now())`,
    );
    repository = new RevisionRepository(fixture.database);
    blobs = new LocalBlobStore(directory);
    service = new SaveService(repository, blobs);
  }, 30_000);
  afterAll(async () => {
    await fixture?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("imports exact bytes and restores an old version as a new revision", async () => {
    const profile = await repository.create("alice", metadata.releaseId, "Lifecycle");
    const first = await service.publish("alice", profile.id, null, metadata, files, "import");
    const second = await service.publish(
      "alice",
      profile.id,
      first.id,
      metadata,
      [{ name: "SAVE.DAT", bytes: Uint8Array.of(9) }],
      "game",
    );
    const restored = await service.restore("alice", profile.id, second.id, first.id);
    expect(restored.id).not.toBe(first.id);
    expect(restored.parentId).toBe(second.id);
    expect(restored.source).toBe("restore");
    expect(await service.file("alice", restored.id, "SAVE.DAT")).toEqual(Buffer.from([1, 2, 3]));
    expect(await service.file("alice", second.id, "SAVE.DAT")).toEqual(Buffer.from([9]));
    await expect(service.file("bob", first.id, "SAVE.DAT")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(service.file("alice", first.id, "missing")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("rejects unauthorized, stale and mismatched uploads before writing blobs", async () => {
    const profile = await repository.create("alice", metadata.releaseId, "Preflight");
    const existing = await service.publish("alice", profile.id, null, metadata, files, "import");
    const before = await readdir(directory);
    await expect(
      service.publish("bob", profile.id, null, metadata, files, "game"),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      service.publish("alice", profile.id, null, metadata, files, "game"),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      service.publish(
        "alice",
        profile.id,
        existing.id,
        { ...metadata, releaseId: "other" },
        files,
        "game",
      ),
    ).rejects.toMatchObject({ code: "release_mismatch" });
    expect(await readdir(directory)).toEqual(before);
    const other = await repository.create("alice", metadata.releaseId, "Other");
    await expect(service.restore("alice", other.id, null, existing.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("replaces one native file while retaining other immutable artifacts and revision checks", async () => {
    const profile = await repository.create("alice", metadata.releaseId, "Editor");
    const original = await service.publish(
      "alice",
      profile.id,
      null,
      { ...metadata, kind: "filesystem" },
      [...files, { name: "__runtime/filesystem.zip", bytes: Uint8Array.of(7, 8) }],
      "game",
    );
    const put = vi.spyOn(blobs, "put");
    await expect(
      service.replaceFile("bob", original.id, "SAVE.DAT", Uint8Array.of(9)),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      service.replaceFile("alice", original.id, "missing", Uint8Array.of(9)),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(put).not.toHaveBeenCalled();
    const edited = await service.replaceFile("alice", original.id, "SAVE.DAT", Uint8Array.of(9));
    expect(put).toHaveBeenCalledTimes(1);
    expect(edited).toMatchObject({
      source: "editor",
      parentId: original.id,
      manifest: { kind: "filesystem" },
    });
    expect(edited.manifest.artifacts[1]).toEqual(original.manifest.artifacts[1]);
    expect(await service.file("alice", edited.id, "SAVE.DAT")).toEqual(Buffer.from([9]));
    expect(await service.file("alice", original.id, "SAVE.DAT")).toEqual(Buffer.from([1, 2, 3]));
    await expect(
      service.replaceFile("alice", original.id, "SAVE.DAT", Uint8Array.of(10)),
    ).rejects.toMatchObject({ code: "conflict" });
    put.mockResolvedValueOnce({ sha256: "0".repeat(64), size: 1 });
    await expect(
      service.replaceFile("alice", edited.id, "SAVE.DAT", Uint8Array.of(10)),
    ).rejects.toThrow("changed");
    expect((await repository.list("alice")).find((entry) => entry.id === profile.id)?.headId).toBe(
      edited.id,
    );
    put.mockRestore();
    const snapshot = await service.publish(
      "alice",
      profile.id,
      edited.id,
      {
        ...metadata,
        kind: "snapshot",
        runtime: { adapter: "test", core: "test", version: "test" },
      },
      files,
      "game",
    );
    await expect(
      service.replaceFile("alice", snapshot.id, "SAVE.DAT", Uint8Array.of(9)),
    ).rejects.toThrow("snapshot");
  });

  it("does not publish partial uploads when storage fails or input changes", async () => {
    const profile = await repository.create("alice", metadata.releaseId, "Failure");
    const put = vi.spyOn(blobs, "put").mockRejectedValueOnce(new Error("disk full"));
    await expect(
      service.publish("alice", profile.id, null, metadata, files, "game"),
    ).rejects.toThrow("disk full");
    put.mockResolvedValueOnce({ sha256: "0".repeat(64), size: 3 });
    await expect(
      service.publish("alice", profile.id, null, metadata, files, "game"),
    ).rejects.toThrow("changed");
    put.mockRestore();
    expect(await repository.history("alice", profile.id)).toEqual([]);
  });

  it("refuses to restore a corrupt blob without changing the profile head", async () => {
    const profile = await repository.create("alice", metadata.releaseId, "Corruption");
    const original = await service.publish(
      "alice",
      profile.id,
      null,
      metadata,
      [{ name: "UNIQUE", bytes: Uint8Array.of(77) }],
      "import",
    );
    const hash = original.manifest.artifacts[0]?.sha256;
    if (!hash) throw new Error("Expected stored artifact");
    await writeFile(join(directory, hash), Uint8Array.of(78));
    await expect(service.restore("alice", profile.id, original.id, original.id)).rejects.toThrow(
      "integrity",
    );
    expect(await repository.history("alice", profile.id)).toHaveLength(1);
  });
});
