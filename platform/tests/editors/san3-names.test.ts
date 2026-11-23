import { describe, expect, it } from "vitest";
import {
  createSan3NameCodec,
  decodeSan3Name,
  san3GlyphLayout,
} from "../../src/editors/san3/names.ts";
import { san3NameFixture as fixture } from "./san3-name-fixture.ts";

describe("Japanese Mega-CD officer names", () => {
  it("encodes supported kanji and the private extension without changing memory", () => {
    const memory = fixture();
    const before = memory.slice();
    const codec = createSan3NameCodec(memory);
    const text = "\u6f22\u5b57\u74d2";
    const encoded = codec.encode("kanji", text);
    expect(encoded).toEqual(Uint8Array.of(0x8a, 0xbf, 0x8e, 0x9a, 0xeb, 0x9f, 0));
    expect(decodeSan3Name(encoded)).toBe(text);
    expect(memory).toEqual(before);
    encoded[0] = 0;
    expect(codec.encode("kanji", text)[0]).toBe(0x8a);
  });

  it("uses the game's hiragana and accepts normal or separated voicing marks", () => {
    const codec = createSan3NameCodec(fixture());
    for (const text of [
      "\u304c\u3071",
      "\u30ac\u30d1",
      "\uff76\uff9e\uff8a\uff9f",
      "\u304b\u309b\u306f\u309c",
    ])
      expect(codec.encode("kana", text)).toEqual(Uint8Array.of(0xb6, 0xde, 0xca, 0xdf, 0, 0, 0, 0));
    expect(decodeSan3Name(Uint8Array.of(0xb6, 0xde, 0xca, 0xdf, 0))).toBe("\u304c\u3071");
    const maximum = "\u3042".repeat(7);
    expect(decodeSan3Name(codec.encode("kana", maximum))).toBe(maximum);
  });

  it("rejects unsupported glyphs, embedded terminators and encoded overflow", () => {
    const codec = createSan3NameCodec(fixture());
    for (const text of ["\u6f22".repeat(4), "\ud83d\ude42", "ABC", "\u6f22\0", "\u9f8d"])
      expect(() => codec.encode("kanji", text)).toThrow();
    for (const text of ["\u3042".repeat(8), "\u304c".repeat(4), "ABC", "\u6f22", "\0"])
      expect(() => codec.encode("kana", text)).toThrow();
    expect(codec.encode("kanji", "")).toEqual(new Uint8Array(7));
    expect(codec.encode("kana", "")).toEqual(new Uint8Array(8));
  });

  it("keeps the JIS aliases distinct from Windows-compatible forms", () => {
    const codec = createSan3NameCodec(fixture());
    const encoded = codec.encode("kanji", "\u301c\u2212");
    expect(encoded).toEqual(Uint8Array.of(0x81, 0x60, 0x81, 0x7c, 0, 0, 0));
    expect(decodeSan3Name(encoded)).toBe("\u301c\u2212");
    expect(() => codec.encode("kanji", "\uff5e\uff0d")).toThrow();
  });

  it("does not invent or silently discard malformed name bytes", () => {
    for (const bytes of [[0x81], [0x81, 0], [0xeb, 0xaa], [0x01], [0x7f], [0x81, 0x30]])
      expect(decodeSan3Name(Uint8Array.from(bytes))).toBe("");
    expect(decodeSan3Name(Uint8Array.of(0xb1, 0, 0xeb, 0xaa))).toBe("\u3042");
    expect(decodeSan3Name(new Uint8Array())).toBe("");
  });

  it("rejects missing, reordered or unknown glyph indexes", () => {
    expect(() => createSan3NameCodec(new Uint8Array(0x80000))).toThrow();
    expect(() => createSan3NameCodec(new Uint8Array(1))).toThrow();
    const invalidEntries = [
      [0, 0x8141],
      [1, 0x8140],
      [san3GlyphLayout.count - 1, 0xebaa],
      [san3GlyphLayout.count - 1, 0xebd9],
    ];
    for (const [index = 0, value = 0] of invalidEntries) {
      const bytes = fixture();
      new DataView(bytes.buffer).setUint16(san3GlyphLayout.offset + index * 2, value);
      expect(() => createSan3NameCodec(bytes)).toThrow();
    }
  });

  it("honors a memory view's offset and snapshots the alphabet", () => {
    const memory = fixture();
    const backing = new Uint8Array(memory.length + 20);
    backing.set(memory, 10);
    const codec = createSan3NameCodec(backing.subarray(10, 10 + memory.length));
    backing.fill(0);
    expect(codec.encode("kanji", "\u6f22")).toEqual(Uint8Array.of(0x8a, 0xbf, 0, 0, 0, 0, 0));
  });
});
