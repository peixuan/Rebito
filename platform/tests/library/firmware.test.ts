import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  describeFirmware,
  readFirmware,
  seedFirmware,
  storeFirmware,
} from "../../src/library/firmware.ts";
import { importGame } from "../../src/library/importer.ts";
import { prepareDiscUpload } from "../../src/library/segacd-upload.ts";
import { withCatalog } from "../../src/library/transaction.ts";
import { discArchive, discBios } from "./segacd-fixtures.ts";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "firmware-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const snapshot = () => withCatalog(directory, () => describeFirmware(directory));
async function upload(bytes: Buffer) {
  return storeFirmware(directory, bytes, (await snapshot()).token, 0);
}

it("recognizes regions, deduplicates uploads and bounds replacements to three slots", async () => {
  expect((await snapshot()).entries.every((entry) => entry.sha256 === null)).toBe(true);
  for (const region of ["J", "U", "E"] as const) {
    const bytes = discBios(region);
    const saved = await upload(bytes);
    expect(await readFirmware(directory, region)).toEqual(bytes);
    expect(await upload(bytes)).toEqual(saved);
  }
  const previous = await snapshot();
  const changed = discBios();
  changed[0x1000] = 42;
  const next = await upload(changed);
  expect(next.token).not.toBe(previous.token);
  expect(next.entries.slice(1)).toEqual(previous.entries.slice(1));
  expect(await readdir(join(directory, "firmware"))).toHaveLength(3);
  expect(await readdir(join(directory, ".uploads"))).toEqual([]);
  await expect(storeFirmware(directory, discBios(), previous.token, 0)).rejects.toMatchObject({
    statusCode: 409,
  });
  expect(await readFirmware(directory, "J")).toEqual(changed);
});

it("preserves the library on invalid firmware, full disks and concurrent publication", async () => {
  const current = await upload(discBios());
  await expect(upload(Buffer.alloc(131072))).rejects.toThrow("library.biosFormat");
  await expect(
    storeFirmware(directory, discBios("U"), current.token, Number.MAX_SAFE_INTEGER),
  ).rejects.toThrow("Insufficient");
  const outcomes = await Promise.allSettled(
    ["U", "E"].map((region) => storeFirmware(directory, discBios(region), current.token, 0)),
  );
  expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
  expect(await readFirmware(directory, "J")).toEqual(discBios());
  expect(await readdir(join(directory, ".uploads"))).toEqual([]);
});

it("rejects corrupted stored bytes and mismatched regional headers", async () => {
  await upload(discBios());
  const path = join(directory, "firmware", "bios_CD_J.bin");
  for (const bytes of [Buffer.alloc(3), discBios("U")]) {
    await writeFile(path, bytes);
    await expect(readFirmware(directory, "J")).rejects.toThrow("library.biosFormat");
  }
});

it("adopts existing releases idempotently without modifying their firmware or identity", async () => {
  const source = join(directory, "source.zip");
  const prepared = join(directory, "prepared.zip");
  await writeFile(source, discArchive());
  await prepareDiscUpload(source, prepared, discBios());
  await importGame(directory, prepared, { title: "Existing CD", system: "segacd" });
  const before = await readFile(join(directory, "catalog.json"));
  await seedFirmware(directory, 0);
  expect(await readFirmware(directory, "J")).toEqual(discBios());
  const changed = discBios();
  changed[0x1000] = 7;
  await upload(changed);
  await seedFirmware(directory, 0);
  expect(await readFirmware(directory, "J")).toEqual(changed);
  expect(await readFile(join(directory, "catalog.json"))).toEqual(before);
});
