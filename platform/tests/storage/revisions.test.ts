import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProgressManifest } from "../../src/domain/artifacts.ts";
import { migrateIdentity } from "../../src/identity/migrate.ts";
import { loadConfig } from "../../src/server/config.ts";
import { RevisionRepository, type RevisionSource } from "../../src/storage/revisions.ts";
import { migrateStorage } from "../../src/storage/schema.ts";
import { testDatabase } from "../database.ts";

const manifest: ProgressManifest = {
  kind: "game-save",
  releaseId: "test-game",
  artifacts: [{ name: "SAVE.DAT", sha256: "a".repeat(64), size: 1 }],
};

describe("transactional revision publication", () => {
  let fixture: Awaited<ReturnType<typeof testDatabase>>;
  let repository: RevisionRepository;
  beforeAll(async () => {
    fixture = await testDatabase();
    const config = loadConfig({
      APP_ORIGIN: "http://localhost:3000",
      DATABASE_URL: "postgresql://unused/unused",
      AUTH_SECRET: randomBytes(32).toString("hex"),
    });
    await migrateIdentity(config, fixture.database);
    await Promise.all([migrateStorage(fixture.database), migrateStorage(fixture.database)]);
    for (const id of ["alice", "bob", "profile-quota", "byte-quota", "revision-quota"]) {
      await fixture.database.query(
        `INSERT INTO "user"(id, name, email, "emailVerified", "createdAt", "updatedAt")
        VALUES ($1, $1, $2, false, now(), now())`,
        [id, `${id}@example.test`],
      );
    }
    repository = new RevisionRepository(fixture.database);
  }, 30_000);
  afterAll(async () => {
    await fixture?.close();
  });

  it("enforces ownership for listing, history, publication and revision reads", async () => {
    const profile = await repository.create("alice", "test-game", " First ");
    expect(profile.name).toBe("First");
    expect(profile.headId).toBeNull();
    expect(await repository.list("alice")).toContainEqual(profile);
    expect(await repository.list("bob")).toEqual([]);
    expect(await repository.history("alice", profile.id)).toEqual([]);
    await expect(repository.history("bob", profile.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      repository.publish("bob", profile.id, null, manifest, "game"),
    ).rejects.toMatchObject({ code: "not_found" });
    const revision = await repository.publish("alice", profile.id, null, manifest, "import");
    expect(await repository.read("alice", revision.id)).toEqual(revision);
    await expect(repository.read("bob", revision.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(repository.read("alice", randomUUID())).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("allows exactly one concurrent writer and preserves both revision generations", async () => {
    const profile = await repository.create("alice", "test-game", "Concurrency");
    const results = await Promise.allSettled([
      repository.publish("alice", profile.id, null, manifest, "game"),
      repository.publish("alice", profile.id, null, manifest, "editor"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "conflict" },
    });
    const history = await repository.history("alice", profile.id);
    expect(history).toHaveLength(1);
    const first = history[0];
    if (!first) throw new Error("Expected published revision");
    const edited = await repository.publish(
      "alice",
      profile.id,
      first.id,
      {
        ...manifest,
        artifacts: [{ name: "SAVE.DAT", sha256: "b".repeat(64), size: 2 }],
      },
      "editor",
    );
    expect(edited.parentId).toBe(first.id);
    await expect(
      repository.publish("alice", profile.id, first.id, manifest, "game"),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await repository.read("alice", first.id)).toEqual(first);
    expect(await repository.history("alice", profile.id)).toHaveLength(2);
    expect((await repository.list("alice")).find((entry) => entry.id === profile.id)?.headId).toBe(
      edited.id,
    );
  });

  it("rolls back rejected inserts and refuses a different game's manifest", async () => {
    const profile = await repository.create("alice", "test-game", "Rollback");
    await expect(
      repository.publish(
        "alice",
        profile.id,
        null,
        { ...manifest, releaseId: "other-game" },
        "game",
      ),
    ).rejects.toMatchObject({ code: "release_mismatch" });
    await expect(
      repository.publish("alice", profile.id, null, manifest, "invalid" as RevisionSource),
    ).rejects.toThrow();
    expect(await repository.history("alice", profile.id)).toEqual([]);
    expect(
      (await repository.list("alice")).find((entry) => entry.id === profile.id)?.headId,
    ).toBeNull();
    await expect(
      repository.publish("alice", profile.id, null, { ...manifest, artifacts: [] }, "game"),
    ).rejects.toThrow();
    expect(
      (await repository.publish("alice", profile.id, null, manifest, "restore")).parentId,
    ).toBeNull();
  });

  it("validates profile bounds and database ownership references", async () => {
    for (const [release, name] of [
      ["../escape", "Name"],
      ["test-game", " "],
      ["test-game", "x".repeat(81)],
    ] as const) {
      await expect(repository.create("alice", release, name)).rejects.toThrow("Invalid profile");
    }
    await expect(repository.create("missing-user", "test-game", "Name")).rejects.toThrow();
  });

  it("serializes concurrent profile creation against the owner's profile limit", async () => {
    const limited = new RevisionRepository(fixture.database, {
      profiles: 2,
      revisions: 10,
      bytes: 10,
    });
    const attempts = await Promise.allSettled(
      [1, 2, 3].map((index) => limited.create("profile-quota", "test-game", `Run ${index}`)),
    );
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    expect(attempts.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "quota_exceeded" },
    });
    expect((await limited.usage("profile-quota")).used).toEqual({
      profiles: 2,
      revisions: 0,
      bytes: 0,
    });
  });

  it("enforces aggregate bytes across simultaneous writes to different profiles", async () => {
    const limited = new RevisionRepository(fixture.database, {
      profiles: 10,
      revisions: 10,
      bytes: 10,
    });
    const profiles = await Promise.all(
      [1, 2].map((index) => limited.create("byte-quota", "test-game", `Run ${index}`)),
    );
    const sixBytes = {
      ...manifest,
      artifacts: [{ name: "SAVE.DAT", sha256: "b".repeat(64), size: 6 }],
    };
    const results = await Promise.allSettled(
      profiles.map((profile) => limited.publish("byte-quota", profile.id, null, sixBytes, "game")),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "quota_exceeded" },
    });
    expect((await limited.usage("byte-quota")).used).toEqual({
      profiles: 2,
      revisions: 1,
      bytes: 6,
    });
    expect((await limited.list("byte-quota")).filter((profile) => profile.headId)).toHaveLength(1);
  });

  it("counts restored/deduplicated revisions while keeping existing progress readable", async () => {
    const limited = new RevisionRepository(fixture.database, {
      profiles: 10,
      revisions: 1,
      bytes: 10,
    });
    const profile = await limited.create("revision-quota", "test-game", "Run");
    const first = await limited.publish("revision-quota", profile.id, null, manifest, "game");
    await expect(
      limited.publish("revision-quota", profile.id, first.id, manifest, "restore"),
    ).rejects.toMatchObject({ code: "quota_exceeded" });
    expect(await limited.read("revision-quota", first.id)).toEqual(first);
    expect((await limited.usage("revision-quota")).used).toEqual({
      profiles: 1,
      revisions: 1,
      bytes: 1,
    });
    expect((await limited.usage("missing-user")).used).toEqual({
      profiles: 0,
      revisions: 0,
      bytes: 0,
    });
  });

  it("leaves no partial schema when a required identity table is absent", async () => {
    const broken = await testDatabase();
    try {
      await expect(migrateStorage(broken.database)).rejects.toThrow();
      const tables = await broken.database.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public'",
      );
      expect(tables.rowCount).toBe(0);
    } finally {
      await broken.close();
    }
  });
});
