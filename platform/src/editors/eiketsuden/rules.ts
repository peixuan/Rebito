/** Names and fixed abilities supplied by the administrator's immutable DOS game. */
export interface EiketsudenRules {
  readonly characters: readonly {
    readonly name: string;
    readonly leadership: number;
    readonly strength: number;
    readonly intelligence: number;
  }[];
  readonly items: readonly string[];
}

export const eiketsudenRulesSize = 19_328;
const characterTable = 0x1100;
const characterCount = 384;
const characterStride = 21;
const itemTable = 0x0d00;
const itemCount = 63;
const itemStride = 16;
const decoder = new TextDecoder("big5", { fatal: true });

function nameAt(bytes: Uint8Array, offset: number, length: number) {
  const field = bytes.subarray(offset, offset + length);
  const end = field.indexOf(0);
  const name = decoder.decode(end < 0 ? field : field.subarray(0, end));
  if (!name.trim() || /\p{Cc}/u.test(name)) throw new Error("Invalid game name");
  return name.trim();
}

/** Shape checks recognize the reviewed table layout, not the provenance of a game. */
export function parseEiketsudenRules(bytes: Uint8Array): EiketsudenRules | undefined {
  if (bytes.length !== eiketsudenRulesSize) return;
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    const characters = Array.from({ length: characterCount }, (_, id) => {
      const offset = characterTable + id * characterStride;
      const leadership = data.getUint8(offset + 17);
      const strength = data.getUint8(offset + 18);
      const intelligence = data.getUint8(offset + 19);
      if (leadership > 100 || strength > 100 || intelligence > 100)
        throw new Error("Invalid game ability");
      // The next eight bytes contain pronunciation data, not part of the Chinese name.
      return Object.freeze({
        name: nameAt(bytes, offset, 6),
        leadership,
        strength,
        intelligence,
      });
    });
    const items = Array.from({ length: itemCount }, (_, id) =>
      nameAt(bytes, itemTable + id * itemStride, 12),
    );
    return Object.freeze({ characters: Object.freeze(characters), items: Object.freeze(items) });
  } catch {
    return;
  }
}
