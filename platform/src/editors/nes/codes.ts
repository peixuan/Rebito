/** One bounded code per call to FCEUmm. Raw codes use CPU addresses, not host offsets. */
export function normalizeNesCode(input: string): string | null {
  if (input.length > 32) return null;
  const code = input.trim().toUpperCase();
  if (/^(?:[APZLGITYEOXUKSVN]{6}|[APZLGITYEOXUKSVN]{8})$/.test(code)) return code;
  // Basic Pro Action Replay stores 00, a big-endian CPU address and one value.
  const normalized = /^00[\dA-F]{6}$/.test(code) ? `${code.slice(2, 6)}:${code.slice(6)}` : code;
  const raw = /^([\dA-F]{4})(\?[\dA-F]{2})?:[\dA-F]{2}$/.exec(normalized);
  if (!raw?.[1]) return null;
  const address = Number.parseInt(raw[1], 16);
  // Mirrored RAM and hardware registers are outside the supported editing surface.
  if (address >= 0x800 && address < 0x6000) return null;
  // The core's zero-page periodic writer ignores comparisons.
  if (raw[2] && address < 0x100) return null;
  return normalized;
}

export const maxNesCodes = 32;
