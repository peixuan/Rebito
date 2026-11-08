import { type DisplayMessage, displayMessage, message } from "../src/shared/messages.ts";
export interface Session {
  user: { id: string; name: string } | null;
  allowRegistration: boolean;
  oidc: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: DisplayMessage | undefined;
  constructor(code: string, status: number, detail?: DisplayMessage) {
    super(code);
    this.status = status;
    this.detail = detail;
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
    );
  return result as T;
}

export function errorText(error: unknown): DisplayMessage {
  const expected = displayMessage(error);
  if (expected) return expected;
  if (error instanceof ApiError) {
    if (error.status === 422 && error.detail) return error.detail;
    if (error.message === "quota_exceeded") return message("errors.quota");
    if (error.message === "disk_space_low") return message("errors.diskSpace");
    if (error.status === 429) return message("errors.rateLimit");
    if (error.status === 401) return message("errors.authentication");
    if (error.status === 409) return message("errors.conflict");
    if (error.status === 403) return message("errors.forbidden");
    return message("errors.request");
  }
  return message("errors.connection");
}
