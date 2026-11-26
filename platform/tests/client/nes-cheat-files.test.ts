import { expect, it } from "vitest";
import {
  maxCheatFileBytes,
  readNesCheatFile,
  writeNesCheatFile,
} from "../../client/nes-cheats/cht.ts";

const hash = "a".repeat(64);
it("round-trips names and multi-part rules while binding the file to its release", () => {
  const entries = [{ name: 'A "quoted" name \\ test', code: "00FE:09+00FF:01" }];
  const text = writeNesCheatFile(hash, entries);
  expect(readNesCheatFile(text, hash)).toEqual({ entries, skipped: 0 });
  expect(text).toContain("enable = false");
  expect(() => readNesCheatFile(text, "b".repeat(64))).toThrow();
});
it("ignores activation flags and excludes unsupported entries as whole groups", () => {
  const input = [
    "cheats = 3",
    'cheat0_desc = "Two codes"',
    "cheat0_code = SXIOPO+00fe:09",
    "cheat0_enable = true",
    "cheat1_code = GZUXNGEI+BAD",
    "cheat2_handler = 1",
    "cheat2_code = 0000:FF",
  ].join("\r\n");
  expect(readNesCheatFile(input, hash)).toEqual({
    entries: [{ name: "Two codes", code: "SXIOPO+00FE:09" }],
    skipped: 2,
  });
});
it.each([
  "cheats = 2048",
  "cheats = 1\ncheat2_code = SXIOPO",
  "cheats = 1\ncheat0_code = AAAAAA\ncheat0_code = SXIOPO",
  "x".repeat(maxCheatFileBytes + 1),
])("rejects malformed or oversized input", (input) =>
  expect(() => readNesCheatFile(input, hash)).toThrow(),
);
