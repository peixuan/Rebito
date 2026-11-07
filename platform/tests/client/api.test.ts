import { afterEach, expect, it, vi } from "vitest";
import { ApiError, api, errorText } from "../../client/api.ts";
import { message } from "../../src/shared/messages.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});
it("uses same-origin credentials without caching private JSON", async () => {
  const fetch = vi
    .fn()
    .mockImplementation(async () => new Response(JSON.stringify({ user: null })));
  vi.stubGlobal("fetch", fetch);
  expect(await api("session")).toEqual({ user: null });
  expect(fetch).toHaveBeenCalledWith("/api/session", {
    credentials: "same-origin",
    cache: "no-store",
  });
  await api("auth/sign-out", {});
  expect(fetch.mock.calls[1]?.[1]).toMatchObject({ method: "POST", body: "{}" });
});

it.each([{ error: "conflict" }, { code: "INVALID_LOGIN" }, {}])(
  "preserves error status and known API error codes",
  async (body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 409 })),
    );
    await expect(api("test")).rejects.toMatchObject({ status: 409 });
  },
);

it("shows useful messages without echoing server details", () => {
  for (const status of [400, 401, 403, 409, 429]) {
    expect(JSON.stringify(errorText(new ApiError("private server details", status)))).not.toContain(
      "private",
    );
  }
  expect(errorText(new Error("network"))).toEqual(message("errors.connection"));
});
