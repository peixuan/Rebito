import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalBlobStore } from "../../src/storage/blobs.ts";

describe("private blob storage", () => {
  let directory: string;
  let store: LocalBlobStore;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "retro-blobs-"));
    store = new LocalBlobStore(directory);
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("persists exact bytes, deduplicates and survives reopening", async () => {
    const bytes = Uint8Array.from([0, 127, 128, 255]);
    const references = await Promise.all(Array.from({ length: 8 }, () => store.put(bytes)));
    const reference = await store.put(bytes);
    expect(references.every((entry) => entry.sha256 === reference.sha256)).toBe(true);
    expect(reference.size).toBe(4);
    expect(await new LocalBlobStore(directory).read(reference)).toEqual(Buffer.from(bytes));
    expect(await readdir(directory)).toEqual([reference.sha256]);
  });

  it("copies input before asynchronous work and supports empty saves", async () => {
    const input = Uint8Array.of(5);
    const pending = store.put(input);
    input[0] = 9;
    expect(await store.read(await pending)).toEqual(Buffer.from([5]));
    expect(await store.read(await store.put(new Uint8Array()))).toHaveLength(0);
  });

  it("detects corrupt contents and incorrect metadata", async () => {
    const reference = await store.put(Uint8Array.of(1, 2));
    await expect(store.read({ ...reference, size: 3 })).rejects.toThrow("integrity");
    await writeFile(join(directory, reference.sha256), Uint8Array.of(1, 9));
    await expect(store.read(reference)).rejects.toThrow("integrity");
    await expect(store.put(Uint8Array.of(1, 2))).rejects.toThrow("integrity");
    expect(await readdir(directory)).toEqual([reference.sha256]);
  });

  it("rejects invalid paths, missing objects and oversized uploads", async () => {
    await expect(store.read({ sha256: "../secret", size: 1 })).rejects.toThrow("digest");
    await expect(store.read({ sha256: "0".repeat(64), size: 1 })).rejects.toThrow("ENOENT");
    await expect(store.put(new Uint8Array(64 * 1024 * 1024 + 1))).rejects.toThrow("limit");
  });

  it("propagates storage failure instead of returning a published reference", async () => {
    const blocked = join(directory, "not-a-directory");
    await writeFile(blocked, "x");
    await expect(new LocalBlobStore(blocked).put(Uint8Array.of(1))).rejects.toThrow();
    expect(await readdir(directory)).toEqual(["not-a-directory"]);
  });
});
