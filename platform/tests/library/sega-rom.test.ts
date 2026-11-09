import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { validateSegaRom } from "../../src/library/sega-rom.ts";
import { mdFixture, sega8Fixture, smdFixture } from "./sega-fixtures.ts";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "sega-header-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
async function validate(bytes: Uint8Array, system: "md" | "sms" | "gg", extension: string) {
  const path = join(directory, `fixture${extension}`);
  await writeFile(path, bytes);
  const file = await open(path, "r");
  try {
    await validateSegaRom(file, system, extension);
  } finally {
    await file.close();
  }
  expect(await readFile(path)).toEqual(Buffer.from(bytes));
}

it("accepts raw and interleaved MD and both 8-bit cartridge models without altering bytes", async () => {
  for (const extension of [".md", ".gen", ".bin"]) await validate(mdFixture(), "md", extension);
  await validate(smdFixture(), "md", ".smd");
  await validate(sega8Fixture(), "sms", ".sms");
  await validate(sega8Fixture(true), "gg", ".gg");
  for (const length of [8192, 16384]) {
    const small = sega8Fixture().slice(0, length);
    small.set(sega8Fixture().subarray(0x7ff0, 0x8000), length - 16);
    await validate(small, "sms", ".sms");
  }
});

it("rejects truncated, malformed, wrong-system and unsupported Sega cartridge images", async () => {
  for (const bytes of [
    new Uint8Array(0),
    mdFixture().slice(0, 511),
    mdFixture().slice(0, -1),
    sega8Fixture(),
    new Uint8Array(32768),
  ])
    await expect(validate(bytes, "md", ".md")).rejects.toMatchObject({ statusCode: 422 });
  for (const model of ["SEGA 32X        ", "SEGA PICO       "]) {
    const bytes = mdFixture();
    bytes.set(new TextEncoder().encode(model), 0x100);
    await expect(validate(bytes, "md", ".md")).rejects.toThrow("library.segaHeader");
  }
  await expect(validate(smdFixture().slice(0, -1), "md", ".smd")).rejects.toThrow(
    "library.segaHeader",
  );
  await expect(validate(new Uint8Array(16896), "md", ".smd")).rejects.toThrow("library.segaHeader");
  await expect(validate(sega8Fixture(true), "sms", ".sms")).rejects.toThrow("library.segaHeader");
  await expect(validate(sega8Fixture(), "gg", ".gg")).rejects.toThrow("library.segaHeader");
  await expect(validate(new Uint8Array(8192), "gg", ".gg")).rejects.toThrow("library.segaHeader");
});
