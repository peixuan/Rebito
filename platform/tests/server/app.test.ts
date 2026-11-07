import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { ProgressError } from "../../src/storage/revisions.ts";

describe("HTTP service boundary", () => {
  const applications: ReturnType<typeof createApp>[] = [];
  function app() {
    const instance = createApp();
    applications.push(instance);
    return instance;
  }
  afterEach(async () => {
    await Promise.all(applications.splice(0).map((instance) => instance.close()));
  });

  it("answers liveness without exposing configuration", async () => {
    const response = await app().inject("/health/live");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(response.headers["cross-origin-embedder-policy"]).toBe("require-corp");
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it.each([
    ["not_found", 404],
    ["conflict", 409],
    ["release_mismatch", 400],
  ] as const)("maps domain error %s to a stable client response", async (code, status) => {
    const instance = app();
    instance.get("/domain-error", () => {
      throw new ProgressError(code);
    });
    const response = await instance.inject("/domain-error");
    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({ error: code });
  });

  it("does not leak internal error details", async () => {
    const instance = app();
    instance.get("/broken", () => {
      throw new Error("private database connection details");
    });
    const response = await instance.inject("/broken");
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "internal_error" });
  });

  it("keeps client error status without echoing exception details", async () => {
    const instance = app();
    instance.get("/invalid", () => {
      throw Object.assign(new Error("private input details"), { statusCode: 422 });
    });
    const response = await instance.inject("/invalid");
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: "invalid_request" });
  });

  it("rejects oversized bodies before the handler", async () => {
    const instance = app();
    instance.post("/input", () => ({ accepted: true }));
    const response = await instance.inject({
      method: "POST",
      url: "/input",
      payload: { value: "x".repeat(1024 * 1024) },
    });
    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: "invalid_request" });
  });

  it.each([200, 600, 422.5, "401", null])(
    "normalizes invalid error status %s",
    async (statusCode) => {
      const instance = app();
      instance.get("/invalid-status", () => {
        throw Object.assign(new Error("invalid handler status"), { statusCode });
      });
      const response = await instance.inject("/invalid-status");
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: "internal_error" });
    },
  );
});
