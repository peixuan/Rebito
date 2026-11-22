import { expect, it } from "vitest";
import { type MemoryDomain, openSnapshotMemory } from "../../src/editors/snapshots/memory.ts";
import { EditorError } from "../../src/editors/types.ts";

const encode = (value: string) => new TextEncoder().encode(value);
function block(tag: string, payload: Uint8Array) {
  const bytes = new Uint8Array(8 + Math.ceil(payload.length / 8) * 8).fill(0xa5);
  bytes.set(encode(tag));
  new DataView(bytes.buffer).setUint32(4, payload.length, true);
  bytes.set(payload, 8);
  return bytes;
}
function container(...blocks: Uint8Array[]) {
  const bytes = new Uint8Array(8 + blocks.reduce((total, entry) => total + entry.length, 0));
  bytes.set([...encode("RASTATE"), 1]);
  let offset = 8;
  for (const entry of blocks) {
    bytes.set(entry, offset);
    offset += entry.length;
  }
  return bytes;
}
function mdMemory() {
  const bytes = new Uint8Array(0xfd000).fill(0xa5);
  bytes.set(encode("GENPLUS-GX 1.7.6"));
  bytes.set([0x34, 0x12, 0x78, 0x56], 16);
  return bytes;
}
const end = () => block("END ", new Uint8Array());
const mdState = () => container(block("MEM ", mdMemory()), end());
function cdState() {
  const memory = new Uint8Array(1_560_538).fill(0xa5);
  memory.set(encode("PicoSEXT"));
  const view = new DataView(memory.buffer);
  view.setUint32(8, 0x191, true);
  let offset = 12;
  for (const [id, size] of [
    [2, 0x10000],
    [13, 0x80000],
    [14, 0x40000],
    [16, 0x2000],
  ]) {
    if (id === undefined || size === undefined) throw new Error("Invalid fixture chunk");
    memory[offset] = id;
    view.setUint32(offset + 1, size, true);
    memory.set([0x34, 0x12], offset + 5);
    offset += 5 + size;
  }
  memory.fill(0, offset, offset + 5);
  return container(block("MEM ", memory), end());
}

it("normalizes 68000 byte order and retains all unrelated state bytes", () => {
  const original = container(
    block("RPLY", new Uint8Array([8, 7, 6])),
    block("MEM ", mdMemory()),
    block("TEST", new Uint8Array([1, 2, 3])),
    end(),
  );
  const opened = openSnapshotMemory(original, "genesis_plus_gx");
  expect([...opened.bytes.slice(0, 4)]).toEqual([0x12, 0x34, 0x56, 0x78]);
  expect(opened.replace(opened.bytes)).toEqual(original);
  opened.bytes[0] = 0x9b;
  opened.bytes[0xffff] = 0x6d;
  const edited = opened.replace(opened.bytes);
  const differences = [...edited.keys()].filter((index) => edited[index] !== original[index]);
  expect(differences).toEqual([49, 48 + 0xfffe]);
  expect(openSnapshotMemory(edited, "genesis_plus_gx").bytes[0xffff]).toBe(0x6d);
  expect(original[49]).toBe(0x12);
  expect(() => opened.replace(new Uint8Array(1))).toThrow(EditorError);
  original.fill(0);
  expect(opened.replace(opened.bytes)).toEqual(edited);
});

it.each<MemoryDomain>(["main", "program", "word", "backup"])(
  "replaces only the selected PicoDrive %s region, retaining reserved capacity",
  (domain) => {
    const original = cdState();
    const opened = openSnapshotMemory(original, "picodrive", domain);
    expect([...opened.bytes.slice(0, 2)]).toEqual(
      domain === "backup" ? [0x34, 0x12] : [0x12, 0x34],
    );
    expect(opened.replace(opened.bytes)).toEqual(original);
    opened.bytes[0] = 0x9b;
    opened.bytes[opened.bytes.length - 1] = 0x6d;
    const edited = opened.replace(opened.bytes);
    expect([...edited.keys()].filter((index) => edited[index] !== original[index])).toHaveLength(2);
    expect(openSnapshotMemory(edited, "picodrive", domain).bytes).toEqual(opened.bytes);
  },
);

it("rejects malformed RASTATE headers, lengths, duplicates and terminators", () => {
  const wrongVersion = mdState();
  wrongVersion[7] = 2;
  const oversized = mdState();
  new DataView(oversized.buffer).setUint32(12, 0xffffffff, true);
  const duplicate = container(block("MEM ", mdMemory()), block("MEM ", mdMemory()), end());
  for (const bytes of [
    new Uint8Array(),
    new Uint8Array(64 * 1024 * 1024 + 1),
    mdState().subarray(1),
    wrongVersion,
    oversized,
    duplicate,
    container(end()),
    container(block("MEM ", mdMemory())),
    container(block("MEM ", mdMemory()), block("END ", new Uint8Array(1))),
    container(block("MEM ", mdMemory()), end(), end()),
    mdState().subarray(0, mdState().length - 1),
  ])
    expect(() => openSnapshotMemory(bytes, "genesis_plus_gx")).toThrow(EditorError);
});

it("requires the exact core format and supported domain", () => {
  const version = mdMemory();
  version[15] = 1;
  for (const memory of [version, mdMemory().subarray(0, 0xfd000 - 1)])
    expect(() =>
      openSnapshotMemory(container(block("MEM ", memory), end()), "genesis_plus_gx"),
    ).toThrow(EditorError);
  expect(() => openSnapshotMemory(cdState(), "genesis_plus_gx")).toThrow(EditorError);
  expect(() => openSnapshotMemory(mdState(), "picodrive")).toThrow(EditorError);
  expect(() => openSnapshotMemory(mdState(), "genesis_plus_gx", "backup")).toThrow(EditorError);
  expect(() => openSnapshotMemory(cdState(), "picodrive", "other" as MemoryDomain)).toThrow(
    EditorError,
  );
});

it("rejects malformed PicoDrive chunks before exposing any memory", () => {
  for (const mutate of [
    (bytes: Uint8Array) => {
      bytes[16] = 0;
    },
    (bytes: Uint8Array) => {
      bytes[24] = 0;
    },
    (bytes: Uint8Array) => {
      bytes[28] = 0;
    },
    (bytes: Uint8Array) => {
      bytes[33 + 0x10000] = 2;
    },
    (bytes: Uint8Array) => {
      new DataView(bytes.buffer).setUint32(29, 0xffffffff, true);
    },
    (bytes: Uint8Array) => {
      new DataView(bytes.buffer).setUint32(29, 0x10001, true);
    },
  ]) {
    const bytes = cdState();
    mutate(bytes);
    expect(() => openSnapshotMemory(bytes, "picodrive")).toThrow(EditorError);
  }
});
