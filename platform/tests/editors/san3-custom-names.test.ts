import { describe, expect, it } from "vitest";
import { san3Adapter } from "../../src/editors/san3/adapter.ts";
import { customNameFields, editCustomNames } from "../../src/editors/san3/custom-names.ts";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { message } from "../../src/shared/messages.ts";
import { san3NameFixture } from "./san3-name-fixture.ts";

function fixture() {
  const bytes = san3NameFixture();
  const view = new DataView(bytes.buffer);
  view.setUint32(0x78000, 0x4b4f4549);
  view.setUint32(0x78776, 0x4b4f4549);
  view.setUint16(0x78788, 200);
  for (let index = 1; index < san3Layout.factions.count; index++)
    view.setUint16(san3Layout.factions.offset + index * san3Layout.factions.stride, 0xffff);
  view.setUint32(san3Layout.factions.offset + 2, san3Layout.cities.offset);
  for (let index = 1; index < san3Layout.cities.count; index++)
    bytes[san3Layout.cities.offset + index * san3Layout.cities.stride + 0x14] = 0xff;
  view.setUint16(san3Layout.custom.offset, 0xffff);
  bytes[san3Layout.custom.offset + 2] = 0xc7;
  bytes.set([0xeb, 0xbb, 0, 0xa5, 0xcd, 0xff, 0xee], san3Layout.custom.offset + 13);
  bytes.set([0xb6, 0xde, 0, 0xff, 0xee, 0xdd, 0xcc, 0xbb], san3Layout.custom.offset + 20);
  return bytes;
}

describe("custom officer name edits", () => {
  it("describes bounded kanji and reading fields using localized labels", () => {
    const fields = customNameFields(new San3Document(fixture()), 0);
    expect(fields).toEqual([
      {
        key: "custom.0.kanji",
        label: message("san3.kanji"),
        value: "\u80c4",
        maxLength: 3,
        help: message("san3.kanjiHelp"),
      },
      {
        key: "custom.0.kana",
        label: message("san3.kana"),
        value: "\u304c",
        maxLength: 7,
        help: message("san3.kanaHelp"),
      },
    ]);
    for (const index of [-1, 68, 0.5, Number.NaN])
      expect(() => customNameFields(new San3Document(fixture()), index)).toThrow();
  });

  it("changes only declared name fields across records and retains unused registration", () => {
    const original = fixture();
    const document = new San3Document(original);
    const result = editCustomNames(document, {
      "custom.0.kanji": "\u6f22\u5b57",
      "custom.67.kana": "\u304c\u3071",
    });
    expect(result.edits.map((edit) => edit.key)).toEqual(["custom.0.kanji", "custom.67.kana"]);
    const untouched = result.bytes.slice();
    for (const edit of result.edits)
      untouched.set(original.subarray(edit.offset, edit.offset + edit.encoded.length), edit.offset);
    expect(untouched).toEqual(original);
    expect(result.bytes.slice(san3Layout.custom.offset, san3Layout.custom.offset + 3)).toEqual(
      Uint8Array.of(0xff, 0xff, 0xc7),
    );
    expect(customNameFields(new San3Document(result.bytes), 0)[0]?.value).toBe("\u6f22\u5b57");
    expect(customNameFields(new San3Document(result.bytes), 67)[1]?.value).toBe("\u304c\u3071");
    result.bytes.fill(0);
    expect(document.copy()).toEqual(original);
  });

  it("preserves synonymous private codes and opaque trailing bytes on a no-op", () => {
    const original = fixture();
    const result = editCustomNames(new San3Document(original), {
      "custom.0.kanji": "\u80c4",
      "custom.0.kana": "\u304c",
    });
    expect(result.edits).toEqual([]);
    expect(result.bytes).toEqual(original);
    expect(editCustomNames(new San3Document(original), {}).bytes).toEqual(original);
  });

  it("preserves aliases and opaque tails when normalized readings are unchanged", () => {
    const original = fixture();
    const document = new San3Document(original);
    for (const value of ["\u30ac", "\uff76\uff9e", "\u304b\u309b", "\u304b\u3099"]) {
      const result = editCustomNames(document, { "custom.0.kana": value });
      expect(result.edits).toEqual([]);
      expect(result.bytes).toEqual(original);
      const draft = { textChanges: { "custom.0.kana": value } };
      expect(san3Adapter.view(original, draft).textChanges).toEqual({});
      expect(() => san3Adapter.apply(original, draft)).toThrow("editor.noChanges");
    }
  });

  it("publishes canonical normalized drafts with exactly the previewed bytes", () => {
    const original = fixture();
    const document = new San3Document(original);
    const preview = editCustomNames(document, {
      "custom.0.kana": "\u30d1",
      "custom.1.kanji": "\u6f22",
    });
    const canonical = Object.fromEntries(preview.edits.map(({ key, after }) => [key, after]));
    expect(canonical["custom.0.kana"]).toBe("\u3071");
    expect(editCustomNames(document, canonical).bytes).toEqual(preview.bytes);
    expect(editCustomNames(new San3Document(preview.bytes), canonical).edits).toEqual([]);
    expect(document.copy()).toEqual(original);
  });

  it("rejects unsupported names and malformed keys atomically in mixed batches", () => {
    const original = fixture();
    const document = new San3Document(original);
    for (const [key, value] of [
      ["custom.0.kanji", "\u6f22".repeat(4)],
      ["custom.0.kanji", "\ud83d\ude42"],
      ["custom.0.kana", "\u304c".repeat(4)],
      ["custom.0.kana", "\u6f22"],
      ["custom.0.name", "x"],
      ["custom.00.kanji", ""],
      ["custom.68.kanji", ""],
      ["officer.0.kanji", ""],
      ["custom.-1.kana", ""],
    ] as const) {
      expect(() =>
        editCustomNames(document, { "custom.1.kanji": "\u6f22", [key]: value }),
      ).toThrow();
      expect(document.copy()).toEqual(original);
    }
    expect(() =>
      editCustomNames(document, { "custom.0.kana": 123 } as unknown as Record<string, string>),
    ).toThrow();
  });
});
