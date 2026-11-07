import { describe, expect, it } from "vitest";
import {
  displayMessage,
  isDisplayMessage,
  MessageError,
  message,
  textIdentity,
} from "../../src/shared/messages.ts";

describe("language-neutral display messages", () => {
  it("retains nested values, diagnostic identity and error causes across frames", () => {
    const value = message("editor.invalidValue", { field: message("editor.money"), value: 1 });
    const cause = new Error("private diagnostic");
    const error = new MessageError(value, { cause });
    expect(error.message).toBe("editor.invalidValue");
    expect(error.cause).toBe(cause);
    expect(displayMessage(error)).toBe(value);
    expect(displayMessage(JSON.parse(JSON.stringify(error)))).toEqual(value);
    expect(textIdentity("user-provided title")).toBe("user-provided title");
    expect(textIdentity(message("editor.money"))).toBe("editor.money");
    expect(textIdentity(value)).toBe(JSON.stringify(value));
  });

  it.each([
    null,
    false,
    1,
    "editor.money",
    [],
    {},
    { messageId: 1 },
    { messageId: "" },
    { messageId: "a".repeat(161) },
    { messageId: "editor.money", parameters: null },
    { messageId: "editor.money", parameters: [] },
    { messageId: "editor.money", parameters: "text" },
    message("editor.money", { value: Infinity }),
    message("editor.money", { value: "x".repeat(32769) }),
    message("editor.money", { "invalid-key": "text" }),
    message(
      "editor.money",
      Object.fromEntries(Array.from({ length: 33 }, (_, id) => [`p${id}`, id])),
    ),
  ])("rejects malformed descriptors without exposing raw diagnostic text: %j", (value) => {
    expect(isDisplayMessage(value)).toBe(false);
    expect(displayMessage({ displayMessage: value })).toBeUndefined();
  });

  it("bounds nested parameters, including cyclic objects", () => {
    const cyclic = message("editor.value", {});
    cyclic.parameters = { nested: cyclic };
    expect(isDisplayMessage(cyclic)).toBe(false);
    expect(isDisplayMessage(message("editor.value", { text: "plain text", value: 0 }))).toBe(true);
    expect(isDisplayMessage({ messageId: "editor.value", parameters: undefined })).toBe(true);
    for (const cause of [null, false, "private error", new Error("private error")])
      expect(displayMessage(cause)).toBeUndefined();
  });
});
