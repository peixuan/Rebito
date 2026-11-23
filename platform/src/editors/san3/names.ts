import { message } from "../../shared/messages.ts";
import { EditorError } from "../types.ts";

/** The game's sorted glyph index precedes its historical officer definitions. */
export const san3GlyphLayout = { offset: 0x3f124, count: 2173 } as const;
export type San3NameKind = "kanji" | "kana";

const decoder = new TextDecoder("shift_jis", { fatal: true });
const invalidSave = () => new EditorError("invalid_save", message("editor.invalidSave"));
const invalidEdit = () => new EditorError("invalid_edit", message("editor.invalidEdit"));

// Format-specific glyph assignments, not a copy of the game's font or repertoire.
// These private codes are absent from the standard Shift-JIS decoder.
const privateGlyphs = new Map<number, string>([
  [0xeb9f, "\u74d2"],
  [0xeba0, "\u6631"],
  [0xeba1, "\u5f67"],
  [0xeba2, "\u90c3"],
  [0xeba3, "\u84af"],
  [0xeba4, "\u8521"],
  [0xeba5, "\u5095"],
  [0xeba6, "\u9095"],
  [0xeba7, "\u6c5c"],
  [0xeba8, "\u8be9"],
  [0xeba9, "\u9093"],
  [0xebab, "\u5e9e"],
  [0xebac, "\u7e47"],
  [0xebad, "\u9088"],
  [0xebae, "\u9a98"],
  [0xebaf, "\u756f"],
  [0xebb0, "\u961a"],
  [0xebb1, "\u73a0"],
  [0xebb2, "\u9857"],
  [0xebb3, "\u90a2"],
  [0xebb4, "\u6b46"],
  [0xebb5, "\u95ff"],
  [0xebb6, "\u794e"],
  [0xebb7, "\u8c2f"],
  [0xebb8, "\u742c"],
  [0xebb9, "\u90dd"],
  [0xebba, "\u742e"],
  [0xebbb, "\u80c4"],
  [0xebbc, "\u891a"],
  [0xebbf, "\u90b3"],
  [0xebc0, "\u7426"],
  [0xebc4, "\u749d"],
  [0xebc6, "\u5f64"],
  [0xebc8, "\u91ed"],
  [0xebc9, "\u6daa"],
  [0xebcc, "\u90ba"],
  [0xebce, "\u81e7"],
  [0xebd0, "\u8392"],
  [0xebd1, "\u7d9d"],
  [0xebd2, "\u8c0c"],
  [0xebd3, "\u607d"],
  [0xebd4, "\u6615"],
  [0xebd5, "\u742a"],
  [0xebd6, "\u7b2e"],
  [0xebd7, "\u795c"],
  [0xebd8, "\u8564"],
  [0xebd9, "\u749c"],
  [0xebdb, "\u6659"],
]);

function hiragana(value: string): string {
  return value.replace(/[\u30a1-\u30f6]/gu, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60),
  );
}

function glyph(code: number): string {
  const custom = privateGlyphs.get(code);
  if (custom) return custom;
  // The game's JIS forms differ from WHATWG's Windows-compatible aliases.
  if (code === 0x8160) return "\u301c";
  if (code === 0x817c) return "\u2212";
  try {
    const bytes = code > 0xff ? Uint8Array.of(code >> 8, code & 0xff) : Uint8Array.of(code);
    const text = decoder.decode(bytes);
    if (code >= 0xa1 && code <= 0xdf) return hiragana(text.normalize("NFKD"));
    return text;
  } catch {
    return "";
  }
}

/** Unknown bytes have no invented name; callers must leave unedited fields intact. */
export function decodeSan3Name(bytes: Uint8Array): string {
  let result = "";
  for (let index = 0; index < bytes.length; index++) {
    let code = bytes[index] ?? 0;
    if (code === 0) break;
    if (code >= 0x80 && (code < 0xa1 || code > 0xdf)) {
      const trail = bytes[++index];
      if (!trail) return "";
      code = (code << 8) | trail;
    }
    const character = glyph(code);
    if (!character || /[\p{Cc}\p{Cf}]/u.test(character)) return "";
    result += character;
  }
  return result.normalize("NFC");
}

/** Builds a writable alphabet from this game's RAM; no font/table is redistributed. */
export function createSan3NameCodec(memory: Uint8Array) {
  if (memory.length !== 0x80000) throw invalidSave();
  const view = new DataView(memory.buffer, memory.byteOffset, memory.byteLength);
  const kanji = new Map<string, number>();
  let previous = 0;
  for (let index = 0; index < san3GlyphLayout.count; index++) {
    const code = view.getUint16(san3GlyphLayout.offset + index * 2);
    const character = glyph(code);
    if (
      code <= previous ||
      code < 0x8140 ||
      code > 0xebdb ||
      !character ||
      (index === 0 && code !== 0x8140)
    )
      throw invalidSave();
    // Prefer the standard code when the private font duplicates a Unicode glyph.
    if (!kanji.has(character)) kanji.set(character, code);
    previous = code;
  }
  if (previous !== 0xebdb) throw invalidSave();
  const kana = new Map<string, number>();
  for (let code = 0xa1; code <= 0xdf; code++) kana.set(glyph(code), code);

  return {
    /** Returns the complete terminated field; rejects overflow instead of truncating. */
    encode(kind: San3NameKind, value: string): Uint8Array {
      const normalized =
        kind === "kana"
          ? hiragana(
              value
                .replace(/\u309b/gu, "\u3099")
                .replace(/\u309c/gu, "\u309a")
                .normalize("NFKD"),
            )
          : value;
      const characters = [...normalized];
      const output = new Uint8Array(kind === "kanji" ? 7 : 8);
      if (characters.length > (kind === "kanji" ? 3 : 7)) throw invalidEdit();
      let index = 0;
      for (const character of characters) {
        const code = (kind === "kanji" ? kanji : kana).get(character);
        if (code === undefined) throw invalidEdit();
        if (code > 0xff) output[index++] = code >> 8;
        output[index++] = code & 0xff;
      }
      return output;
    },
  };
}
