import { mkdtemp, readdir, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { afterEach, beforeEach, expect, it } from "vitest";
import { coverPng } from "../../src/library/cover-image.ts";
import {
  coverBudget,
  coverInfo,
  coverName,
  readCover,
  replaceCover,
} from "../../src/library/covers.ts";

const id = `nes-${"a".repeat(64)}`;
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "rebito-covers-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

it("writes a lossless image with bounded rows and no source metadata", () => {
  const pixels = Buffer.from([21, 34, 55, 255, 45, 17, 22, 78]);
  const png = coverPng({ width: 1, height: 2, rgba: pixels.toString("base64") });
  const size = png.readUInt32BE(33);
  expect(png.toString("ascii", 37, 41)).toBe("IDAT");
  expect(inflateSync(png.subarray(41, 41 + size))).toEqual(
    Buffer.from([0, ...pixels.subarray(0, 4), 0, ...pixels.subarray(4)]),
  );
  expect(png.subarray(-8, -4).toString("ascii")).toBe("IEND");
});

it("preserves the previous image when the artwork budget or disk reserve is full", async () => {
  const bytes = coverPng({ width: 1, height: 1, rgba: "/wAA/w==" });
  const version = await replaceCover(dir, id, null, bytes, 0);
  const other = join(dir, coverName(`nes-${"b".repeat(64)}`));
  await writeFile(other, "");
  await truncate(other, coverBudget);
  await expect(replaceCover(dir, id, version, bytes, 0)).rejects.toMatchObject({ statusCode: 507 });
  await rm(other);
  await expect(replaceCover(dir, id, version, bytes, Number.MAX_SAFE_INTEGER)).rejects.toThrow(
    "Insufficient",
  );
  expect((await coverInfo(dir, id))?.version).toBe(version);
  await replaceCover(dir, id, version, null, 0);
  expect(await readdir(join(dir, "covers"))).toEqual([]);
});

it("serves only the requested cover revision for a well-formed release ID", async () => {
  expect(() => coverName("not-a-release")).toThrow("Invalid cover release ID");
  await expect(readCover(dir, id, "absent")).resolves.toBeNull();
  const first = await replaceCover(dir, id, null, Buffer.of(1), 0);
  const second = await replaceCover(dir, id, first, Buffer.of(2, 3), 0);
  if (!first || !second) throw new Error("Missing persisted cover versions");
  expect(await readCover(dir, id, first)).toBeNull();
  expect(await readCover(dir, id, second)).toEqual(Buffer.of(2, 3));
});
