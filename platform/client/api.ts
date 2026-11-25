import { type DisplayMessage, displayMessage, message } from "../src/shared/messages.ts";
export interface Session {
  user: { id: string; name: string; admin: boolean } | null;
  allowRegistration: boolean;
  oidc: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: DisplayMessage | undefined;
  readonly retryAfterMs: number;
  constructor(code: string, status: number, detail?: DisplayMessage, retryAfterMs = 0) {
    super(code);
    this.status = status;
    this.detail = detail;
    this.retryAfterMs = retryAfterMs;
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          ...(body instanceof FormData
            ? { body }
            : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
        }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      result.error ?? result.code ?? "request_failed",
      response.status,
      displayMessage(result),
      // Our admission endpoint sends delta-seconds, not an HTTP date.
      Number(response.headers.get("retry-after")) * 1000,
    );
  return result as T;
}

export function errorText(error: unknown): DisplayMessage {
  const expected = displayMessage(error);
  if (expected) return expected;
  if (error instanceof ApiError) {
    if (error.status === 422 && error.detail) return error.detail;
    if (error.message === "library_error" && error.detail) return error.detail;
    if (error.message === "upload_busy") return message("errors.uploadBusy");
    if (error.message === "save_queue_timeout") return message("errors.queueTimeout");
    if (error.status === 413) return message("errors.uploadSize");
    if (error.message === "site_quota_exceeded") return message("errors.siteQuota");
    if (error.message === "quota_exceeded") return message("errors.quota");
    if (error.message === "disk_space_low") return message("errors.diskSpace");
    if (error.status === 429) return message("errors.rateLimit");
    if (error.status === 401) return message("errors.authentication");
    if (error.status === 409) return message("errors.conflict");
    if (error.status === 403) return message("errors.forbidden");
    if (error.status === 404) return message("errors.notFound");
    return message("errors.request");
  }
  return message("errors.connection");
}
