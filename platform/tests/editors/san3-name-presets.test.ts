import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { San3Document, san3Layout } from "../../src/editors/san3/document.ts";
import { editSan3 } from "../../src/editors/san3/fields.ts";
import { san3NamePresetAction } from "../../src/editors/san3/name-presets.ts";
import { createSan3NameCodec, decodeSan3Name } from "../../src/editors/san3/names.ts";
import { isDisplayMessage } from "../../src/shared/messages.ts";
import { san3GovernanceFixture } from "./san3-governance-fixture.ts";
import { san3NameFixture } from "./san3-name-fixture.ts";

it("fills every custom ability without registering slots or changing live officers", () => {
  const bytes = san3GovernanceFixture();
  const data = new DataView(bytes.buffer);
  for (let index = 0; index < 68; index++)
    data.setUint16(san3Layout.custom.offset + index * 28, 0xffff);
  const before = bytes.slice();
  const result = editSan3(
    new San3Document(Buffer.from(bytes)),
    san3NamePresetAction.numericDefaults,
  );
  expect(Object.keys(san3NamePresetAction.numericDefaults)).toHaveLength(408);
  const changed = new San3Document(result.bytes);
  const expected = before.slice();
  for (let index = 0; index < 68; index++) {
    expect(Object.values(changed.attributes(532 + index))).toEqual(Array(6).fill(100));
    expect(changed.read(san3Layout.custom.offset + index * 28, 2)).toBe(0xffff);
    expected.fill(
      100,
      san3Layout.custom.offset + index * 28 + 4,
      san3Layout.custom.offset + index * 28 + 10,
    );
  }
  expect(result.bytes).toEqual(expected);
  expect(bytes).toEqual(before);
});

it("provides identical original name presets for all 68 custom definitions in both locales", () => {
  const catalogs = ["en", "zh-CN"].map(
    (locale): Record<string, string> =>
      JSON.parse(readFileSync(`client/locales/${locale}/editors/san3-presets.json`, "utf8")),
  );
  const catalog = catalogs[0] ?? {};
  expect(catalogs[1]).toEqual(catalog);
  expect(Object.keys(catalog)).toHaveLength(136);
  expect(san3NamePresetAction.id).toBe("custom-name-presets");
  expect(Object.keys(san3NamePresetAction.textDefaults)).toHaveLength(136);
  const names = Array.from({ length: 68 }, (_, index) => catalog[`san3.presetName${index}`] ?? "");
  const codec = createSan3NameCodec(san3NameFixture(names));
  for (let index = 0; index < 68; index++) {
    for (const kind of ["kanji", "kana"] as const) {
      const key = `custom.${index}.${kind}`;
      const descriptor = san3NamePresetAction.textDefaults[key];
      const messageId = `san3.${kind === "kanji" ? "presetName" : "presetReading"}${index}`;
      expect(descriptor).toEqual({ messageId });
      expect(isDisplayMessage(descriptor)).toBe(true);
      const value = catalog[messageId] ?? "";
      expect(value.length, messageId).toBeGreaterThan(0);
      const encoded = codec.encode(kind, value);
      expect(encoded).toHaveLength(kind === "kanji" ? 7 : 8);
      expect(encoded.at(-1)).toBe(0);
      expect(codec.encode(kind, decodeSan3Name(encoded))).toEqual(encoded);
    }
  }
});
