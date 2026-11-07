/** A language-neutral message. Values remain data and must never be rendered as HTML. */
export interface DisplayMessage {
  messageId: string;
  parameters?: Record<string, string | number | DisplayMessage>;
}

/** Plain strings are user content or format-defined data, never translation keys. */
export type DisplayText = string | DisplayMessage;

export function isDisplayMessage(value: unknown, depth = 0): value is DisplayMessage {
  if (depth > 8 || typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  if (!("messageId" in value) || typeof value.messageId !== "string") return false;
  if (value.messageId.length > 160 || !/^[a-z][\w]*(?:\.[\w]+)+$/.test(value.messageId))
    return false;
  if (!("parameters" in value) || value.parameters === undefined) return true;
  const parameters = value.parameters;
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters))
    return false;
  const entries = Object.entries(parameters);
  return (
    entries.length <= 32 &&
    entries.every(
      ([key, item]) =>
        /^[a-zA-Z]\w{0,63}$/.test(key) &&
        (typeof item === "string"
          ? item.length <= 32768
          : typeof item === "number"
            ? Number.isFinite(item)
            : isDisplayMessage(item, depth + 1)),
    )
  );
}

export function message(
  messageId: string,
  parameters?: DisplayMessage["parameters"],
): DisplayMessage {
  return parameters ? { messageId, parameters } : { messageId };
}

/** Cross-frame errors cannot safely be identified with instanceof. */
export function displayMessage(value: unknown): DisplayMessage | undefined {
  if (typeof value !== "object" || value === null || !("displayMessage" in value)) return;
  const candidate = value.displayMessage;
  if (isDisplayMessage(candidate)) return candidate;
}

/** Expected user-facing failures carry descriptors; diagnostics stay in server logs. */
export class MessageError extends Error {
  readonly displayMessage: DisplayMessage;

  constructor(value: DisplayMessage, options?: ErrorOptions) {
    super(value.messageId, options);
    this.displayMessage = value;
  }
}

/** Presentation identity is independent of the selected language and object references. */
export function textIdentity(text: DisplayText): string {
  if (typeof text === "string") return text;
  return text.parameters ? JSON.stringify(text) : text.messageId;
}
