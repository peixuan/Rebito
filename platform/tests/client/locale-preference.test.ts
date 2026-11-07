import { afterEach, expect, it, vi } from "vitest";
import {
  browserLocale,
  localeStorageKey,
  preferredLocale,
} from "../../client/locale-preference.ts";

afterEach(() => vi.unstubAllGlobals());

it.each([
  ["zh-CN", ["en-US"], "zh-CN"],
  ["en", ["zh-CN"], "en"],
  [null, ["fr", "zh-TW", "en"], "zh-CN"],
  [null, ["en-GB", "zh-CN"], "en"],
  ["invalid", ["ZH-hans-CN"], "zh-CN"],
  ["constructor", ["unknown"], "en"],
  [null, [], "en"],
] as const)(
  "selects a supported locale from preference %s and languages %j",
  (stored, languages, expected) => {
    expect(preferredLocale(stored, languages)).toBe(expected);
  },
);

it("reads only the application preference and tolerates blocked browser storage", () => {
  vi.stubGlobal("navigator", { languages: ["zh-CN"] });
  const getItem = vi.fn().mockReturnValue("en");
  vi.stubGlobal("localStorage", { getItem });
  expect(browserLocale()).toBe("en");
  expect(getItem).toHaveBeenCalledWith(localeStorageKey);
  getItem.mockImplementation(() => {
    throw new Error("Storage blocked");
  });
  expect(browserLocale()).toBe("zh-CN");
});
