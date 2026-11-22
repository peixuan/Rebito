import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { describeBios, verifyBios } from "../../src/library/bios-verification.ts";
import { discBios } from "./segacd-fixtures.ts";

it("identifies unknown firmware without presenting a valid header as a verified dump", () => {
  const bytes = discBios();
  const md5 = createHash("md5").update(bytes).digest("hex");
  expect(describeBios(bytes)).toEqual({
    region: "J",
    name: "bios_CD_J.bin",
    md5,
    recognized: false,
  });
  expect(() => verifyBios(bytes)).toThrow("library.biosUnrecognized");
  expect(verifyBios(bytes, true)).toBe(bytes);
  const malformed = discBios("JUE");
  expect(() => verifyBios(malformed, true)).toThrow("library.biosFormat");
});
