/** One bounded code per call to FCEUmm. Raw codes use CPU addresses, not host offsets. */
export function normalizeNesCode(input: string): string | null {
  if (input.length > 32) return null;
  const code = input.trim().toUpperCase();
  if (/^(?:[APZLGITYEOXUKSVN]{6}|[APZLGITYEOXUKSVN]{8})$/.test(code)) return code;
  const raw = /^([\dA-F]{4})(\?[\dA-F]{2})?:[\dA-F]{2}$/.exec(code);
  if (!raw?.[1]) return null;
  const address = Number.parseInt(raw[1], 16);
  // Mirrored RAM and hardware registers are outside the supported editing surface.
  if (address >= 0x800 && address < 0x6000) return null;
  // The core's zero-page periodic writer ignores comparisons.
  if (raw[2] && address < 0x100) return null;
  return code;
}

export const maxNesCodes = 32;
