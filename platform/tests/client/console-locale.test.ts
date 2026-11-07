import { afterEach, expect, it, vi } from "vitest";
import { consoleLocale } from "../../client/runtime/console-locale.ts";

afterEach(() => vi.unstubAllGlobals());

it("loads only the pinned local translation when requested", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ Close: "Localized close" })));
  vi.stubGlobal("fetch", fetch);
  expect(await consoleLocale("/runtime/", "en")).toEqual({});
  expect(fetch).not.toHaveBeenCalled();
  expect(await consoleLocale("/runtime/", "zh-CN")).toEqual({
    language: "zh-CN",
    langJson: { Close: "Localized close" },
  });
  expect(fetch).toHaveBeenCalledWith("/runtime/localization/zh-CN.json");
});

it.each([null, [], { Close: 1 }, "invalid", 12])(
  "falls back for malformed language resources: %j",
  async (value) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(value))));
    expect(await consoleLocale("/runtime/", "zh-CN")).toEqual({});
  },
);

it("keeps the English menu available after network and parsing failures", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("unavailable", { status: 404 }))
    .mockResolvedValueOnce(new Response("invalid json"))
    .mockRejectedValueOnce(new Error("network failure"));
  vi.stubGlobal("fetch", fetch);
  for (let attempt = 0; attempt < 3; attempt++)
    expect(await consoleLocale("/runtime/", "zh-CN")).toEqual({});
});
