import { zipSync } from "fflate";
import { expect, it } from "vitest";
import { parseEiketsudenRules } from "../../src/editors/eiketsuden/rules.ts";
import {
  eiketsudenArchiveLimit,
  readEiketsudenRules,
} from "../../src/editors/eiketsuden/rules-archive.ts";
import { eiketsudenRulesFixture as fixture } from "./eiketsuden-rules-fixture.ts";

it("reads all officers and real items without crossing their name fields", () => {
  const bytes = fixture();
  bytes.set([0xa4, 0xa4, 0xa4, 0xe5, 0, 0xff, 0xff, 0xff], 0x1100);
  const rules = parseEiketsudenRules(bytes);
  expect(rules?.characters).toHaveLength(384);
  expect(rules?.characters[0]).toEqual({
    name: "\u4e2d\u6587",
    leadership: 0,
    strength: 1,
    intelligence: 2,
  });
  expect(rules?.characters[383]).toEqual({
    name: "C00383",
    leadership: 80,
    strength: 81,
    intelligence: 82,
  });
  expect(rules?.items).toHaveLength(63);
  expect(rules?.items[62]).toBe("Item 62");
  expect(Object.isFrozen(rules?.characters[0])).toBe(true);
  expect(Object.isFrozen(rules?.items)).toBe(true);
});

it("detaches parsed values from padded mutable input", () => {
  const original = fixture();
  const padded = new Uint8Array(original.length + 20);
  padded.set(original, 10);
  const rules = parseEiketsudenRules(padded.subarray(10, -10));
  padded.fill(0);
  expect(rules?.characters[1]?.name).toBe("C00001");
  expect(rules?.items[1]).toBe("Item 1");
});

it("rejects wrong lengths, invalid names and out-of-range fixed abilities", () => {
  expect(parseEiketsudenRules(new Uint8Array(19_327))).toBeUndefined();
  expect(parseEiketsudenRules(new Uint8Array(19_329))).toBeUndefined();
  for (const [offset, value] of [
    [0x1100, 0],
    [0x1100, 1],
    [0x1100, 9],
    [0x1100, 0xa4],
    [0x0d00, 0],
    [0x0d00, 0x7f],
    [0x1100 + 17, 101],
    [0x1100 + 18, 255],
    [0x1100 + 383 * 21 + 19, 101],
  ] as const) {
    const bytes = fixture();
    bytes[offset] = value;
    expect(parseEiketsudenRules(bytes)).toBeUndefined();
  }
});

it("reads one case-insensitive metadata basename from nested ZIP paths", async () => {
  const bundle = zipSync({
    "game/": new Uint8Array(),
    "game/bAkDaTa.R3": fixture(),
    "README.TXT": new Uint8Array([65]),
  });
  expect((await readEiketsudenRules(bundle))?.characters[0]?.name).toBe("C00000");
  expect(await readEiketsudenRules(zipSync({ "OTHER.R3": fixture() }))).toBeUndefined();
  expect(
    await readEiketsudenRules(zipSync({ "a/BAKDATA.R3": fixture(), "b/bakdata.r3": fixture() })),
  ).toBeUndefined();
});

function centralDirectory(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset <= bytes.length - 4; offset++)
    if (view.getUint32(offset, true) === 0x02014b50) return { view, offset };
  throw new Error("Synthetic ZIP has no central directory");
}

it("rejects oversized archives, unsupported metadata and excessive entries", async () => {
  expect(await readEiketsudenRules(new Uint8Array(eiketsudenArchiveLimit + 1))).toBeUndefined();
  expect(await readEiketsudenRules(new Uint8Array(10))).toBeUndefined();
  expect(
    await readEiketsudenRules(zipSync({ "BAKDATA.R3": new Uint8Array(19_329) })),
  ).toBeUndefined();
  expect(
    await readEiketsudenRules(zipSync({ "BAKDATA.R3": new Uint8Array(19_328) })),
  ).toBeUndefined();
  const many = zipSync({ "BAKDATA.R3": fixture() });
  const view = new DataView(many.buffer);
  view.setUint16(many.length - 22 + 8, 5001, true);
  view.setUint16(many.length - 22 + 10, 5001, true);
  expect(await readEiketsudenRules(many)).toBeUndefined();
});

it("rejects encrypted members, symlinks, bad CRC and inconsistent lengths", async () => {
  const mutations = [
    (view: DataView, at: number) => view.setUint16(at + 8, 1, true),
    (view: DataView, at: number) => view.setUint32(at + 38, 0o120777 << 16, true),
    (view: DataView, at: number) => view.setUint32(at + 16, 0, true),
    (view: DataView, at: number) => view.setUint32(at + 24, 19_328, true),
    (view: DataView, at: number) => view.setUint16(at + 10, 99, true),
  ];
  for (const [index, mutate] of mutations.entries()) {
    const bundle = zipSync({ "BAKDATA.R3": index === 3 ? new Uint8Array(20_000) : fixture() });
    const { view, offset } = centralDirectory(bundle);
    mutate(view, offset);
    expect(await readEiketsudenRules(bundle)).toBeUndefined();
  }
});
