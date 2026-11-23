import { decodeSan3Name, san3GlyphLayout } from "../../src/editors/san3/names.ts";

/** Synthetic alphabet assembled from the standard decoder, not extracted game data. */
export function san3NameFixture(requiredCharacters: string[] = []) {
  const codes = new Set([0x8140, 0x8160, 0x817c, 0x8abf, 0x8e9a, 0xe3f2, 0xeb9f, 0xebbb, 0xebdb]);
  const required = new Set(requiredCharacters.flatMap((text) => [...text]));
  for (let code = 0x8140; required.size && code <= 0xebdb; code++) {
    const character = decodeSan3Name(Uint8Array.of(code >> 8, code & 0xff));
    if (required.delete(character)) codes.add(code);
  }
  if (required.size || codes.size > san3GlyphLayout.count)
    throw new Error("The synthetic alphabet cannot represent the requested characters.");
  const decoder = new TextDecoder("shift_jis", { fatal: true });
  for (let code = 0x8141; codes.size < san3GlyphLayout.count; code++) {
    try {
      const text = decoder.decode(Uint8Array.of(code >> 8, code & 0xff));
      if ([...text].length === 1) codes.add(code);
    } catch {
      // Unassigned byte pairs do not belong to this generated alphabet.
    }
  }
  const bytes = new Uint8Array(0x80000);
  const view = new DataView(bytes.buffer);
  [...codes]
    .sort((left, right) => left - right)
    .forEach((code, index) => {
      view.setUint16(san3GlyphLayout.offset + index * 2, code);
    });
  return bytes;
}
