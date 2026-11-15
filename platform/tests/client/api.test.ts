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

it("sends binary form data with the browser-generated multipart boundary", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  const form = new FormData();
  form.append("file", new Blob([Uint8Array.of(0, 255)]), "save.srm");
  await api("profiles/test/revisions", form);
  const options = fetch.mock.calls[0]?.[1];
  expect(options.body).toBe(form);
  expect(options).not.toHaveProperty("headers");
  expect(options).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
});

it("shows useful messages without echoing server details", () => {
  for (const status of [400, 401, 403, 409, 429]) {
    expect(JSON.stringify(errorText(new ApiError("private server details", status)))).not.toContain(
      "private",
    );
  }
  expect(errorText(new Error("network"))).toEqual(message("errors.connection"));
  expect(errorText(new ApiError("quota_exceeded", 507))).toEqual(message("errors.quota"));
  expect(errorText(new ApiError("disk_space_low", 507))).toEqual(message("errors.diskSpace"));
  expect(errorText(new ApiError("upload_busy", 503))).toEqual(message("errors.uploadBusy"));
  expect(errorText(new ApiError("save_queue_timeout", 503))).toEqual(
    message("errors.queueTimeout"),
  );
});
it("shows explicit editor validation messages while retaining the error code", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "invalid_edit",
          displayMessage: message("koukai2.selectDismissalPort"),
        }),
        {
          status: 422,
        },
      ),
    ),
  );
  const error = await api("test").catch((cause: unknown) => cause);
  expect(error).toMatchObject({ message: "invalid_edit", status: 422 });
  expect(errorText(error)).toEqual(message("koukai2.selectDismissalPort"));
});
