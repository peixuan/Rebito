import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateIdentity } from "../../src/identity/migrate.ts";
import { SaveService } from "../../src/saves/service.ts";
import { loadConfig } from "../../src/server/config.ts";
import { LocalBlobStore } from "../../src/storage/blobs.ts";
import { DiskSpaceError } from "../../src/storage/capacity.ts";
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

  it("rejects quota-exhausted uploads before writing blobs", async () => {
    const limited = new RevisionRepository(fixture.database, {
      profiles: 100,
      revisions: 100,
      bytes: 1,
    });
    const bounded = new SaveService(limited, blobs);
    const profile = await limited.create("alice", metadata.releaseId, "Quota");
    const before = await readdir(directory);
    await expect(
      bounded.publish("alice", profile.id, null, metadata, files, "game"),
    ).rejects.toMatchObject({ code: "quota_exceeded" });
    expect(await readdir(directory)).toEqual(before);
    expect(await limited.history("alice", profile.id)).toEqual([]);
  });

  it("refuses writes below the disk reserve without advancing or damaging existing progress", async () => {
    const profile = await repository.create("alice", metadata.releaseId, "Disk reserve");
    const original = await service.publish("alice", profile.id, null, metadata, files, "game");
    const before = await readdir(directory);
    const bounded = new SaveService(
      repository,
      new LocalBlobStore(directory, Number.MAX_SAFE_INTEGER),
    );
    await expect(
      bounded.publish("alice", profile.id, original.id, metadata, files, "game"),
    ).rejects.toBeInstanceOf(DiskSpaceError);
    expect(await readdir(directory)).toEqual(before);
    expect(await repository.history("alice", profile.id)).toHaveLength(1);
    expect((await repository.list("alice")).find((entry) => entry.id === profile.id)?.headId).toBe(
      original.id,
    );
    expect(await bounded.file("alice", original.id, "SAVE.DAT")).toEqual(Buffer.from([1, 2, 3]));
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
      service.replaceFiles("bob", original.id, [{ name: "SAVE.DAT", bytes: Uint8Array.of(9) }]),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      service.replaceFiles("alice", original.id, [{ name: "missing", bytes: Uint8Array.of(9) }]),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(put).not.toHaveBeenCalled();
    const edited = await service.replaceFiles("alice", original.id, [
      { name: "SAVE.DAT", bytes: Uint8Array.of(9) },
    ]);
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
      service.replaceFiles("alice", original.id, [{ name: "SAVE.DAT", bytes: Uint8Array.of(10) }]),
    ).rejects.toMatchObject({ code: "conflict" });
    put.mockResolvedValueOnce({ sha256: "0".repeat(64), size: 1 });
    await expect(
      service.replaceFiles("alice", edited.id, [{ name: "SAVE.DAT", bytes: Uint8Array.of(10) }]),
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
      service.replaceFiles("alice", snapshot.id, [{ name: "SAVE.DAT", bytes: Uint8Array.of(9) }]),
    ).rejects.toThrow("snapshot");
  });

  it("publishes only the state of a snapshot and retains all companion identities", async () => {
    const profile = await repository.create("alice", metadata.releaseId, "State edit");
    const native = await service.publish("alice", profile.id, null, metadata, files, "game");
    await expect(service.replaceSnapshot("alice", native.id, Uint8Array.of(9))).rejects.toThrow();
    const runtime = { adapter: "emulatorjs", core: "test", version: "pinned-test" };
    const original = await service.publish(
      "alice",
      profile.id,
      native.id,
      { ...metadata, kind: "snapshot", runtime },
      [
        { name: "__runtime/state.bin", bytes: Uint8Array.of(3, 4) },
        { name: "save.srm", bytes: Uint8Array.of(7, 8) },
        { name: "opaque.dat", bytes: Uint8Array.of(5) },
      ],
      "game",
    );
    const put = vi.spyOn(blobs, "put");
    try {
      await expect(
        service.replaceSnapshot("bob", original.id, Uint8Array.of(9)),
      ).rejects.toMatchObject({ code: "not_found" });
      await expect(
        service.replaceFiles("alice", original.id, [{ name: "save.srm", bytes: Uint8Array.of(9) }]),
      ).rejects.toThrow("snapshot");
      expect(put).not.toHaveBeenCalled();
      const edited = await service.replaceSnapshot("alice", original.id, Uint8Array.of(9, 4));
      expect(edited).toMatchObject({
        parentId: original.id,
        source: "editor",
        manifest: { ...metadata, kind: "snapshot", runtime },
      });
      expect(edited.manifest.artifacts.slice(1)).toEqual(original.manifest.artifacts.slice(1));
      expect(put).toHaveBeenCalledTimes(1);
      expect(await service.file("alice", original.id, "__runtime/state.bin")).toEqual(
        Buffer.from([3, 4]),
      );
      expect(await service.file("alice", edited.id, "__runtime/state.bin")).toEqual(
        Buffer.from([9, 4]),
      );
      put.mockClear();
      await expect(
        service.replaceSnapshot("alice", original.id, Uint8Array.of(1)),
      ).rejects.toMatchObject({ code: "conflict" });
      expect(put).not.toHaveBeenCalled();
      put.mockRejectedValueOnce(new Error("disk full"));
      await expect(service.replaceSnapshot("alice", edited.id, Uint8Array.of(2))).rejects.toThrow(
        "disk full",
      );
      expect((await repository.list("alice")).find(({ id }) => id === profile.id)?.headId).toBe(
        edited.id,
      );
    } finally {
      put.mockRestore();
    }
  });

  it("keeps one winning snapshot edit when two writers share the same base", async () => {
    const profile = await repository.create("alice", metadata.releaseId, "Concurrent state edit");
    const original = await service.publish(
      "alice",
      profile.id,
      null,
      {
        ...metadata,
        kind: "snapshot",
        runtime: { adapter: "test", core: "test", version: "test" },
      },
      [{ name: "__runtime/state.bin", bytes: Uint8Array.of(1) }],
      "game",
    );
    const outcomes = await Promise.allSettled([
      service.replaceSnapshot("alice", original.id, Uint8Array.of(2)),
      service.replaceSnapshot("alice", original.id, Uint8Array.of(3)),
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find(({ status }) => status === "rejected")).toMatchObject({
      reason: { code: "conflict" },
    });
    expect(await repository.history("alice", profile.id)).toHaveLength(2);
    expect(await service.file("alice", original.id, "__runtime/state.bin")).toEqual(
      Buffer.from([1]),
    );
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

  it("publishes related files together and leaves the head intact on a later blob failure", async () => {
    const profile = await repository.create("alice", metadata.releaseId, "Multiple files");
    const original = await service.publish(
      "alice",
      profile.id,
      null,
      metadata,
      [
        ...files,
        { name: "slots/index.dat", bytes: Uint8Array.of(4) },
        { name: "config.dat", bytes: Uint8Array.of(5) },
      ],
      "game",
    );
    const replacements = [
      { name: "SAVE.DAT", bytes: Uint8Array.of(8) },
      { name: "slots/index.dat", bytes: Uint8Array.of(9) },
    ];
    const put = vi.spyOn(blobs, "put");
    await expect(service.replaceFiles("alice", original.id, [])).rejects.toThrow("Empty");
    await expect(service.replaceFiles("alice", original.id, [...files, ...files])).rejects.toThrow(
      "duplicate",
    );
    expect(put).not.toHaveBeenCalled();
    put.mockResolvedValueOnce({
      sha256: createHash("sha256").update(Uint8Array.of(8)).digest("hex"),
      size: 1,
    });
    put.mockRejectedValueOnce(new Error("disk full"));
    await expect(service.replaceFiles("alice", original.id, replacements)).rejects.toThrow(
      "disk full",
    );
    expect(await repository.history("alice", profile.id)).toHaveLength(1);
    expect(await service.file("alice", original.id, "SAVE.DAT")).toEqual(Buffer.from([1, 2, 3]));
    put.mockRestore();
    const attempts = await Promise.allSettled([
      service.replaceFiles("alice", original.id, replacements),
      service.replaceFiles("alice", original.id, replacements),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    const history = await repository.history("alice", profile.id);
    expect(history).toHaveLength(2);
    const edited = history[0];
    if (!edited) throw new Error("Missing edited revision");
    expect(edited.manifest.artifacts[2]).toEqual(original.manifest.artifacts[2]);
    for (const file of replacements)
      expect(await service.file("alice", edited.id, file.name)).toEqual(Buffer.from(file.bytes));
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
