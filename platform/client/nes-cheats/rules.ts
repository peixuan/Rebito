import { maxNesCodes, normalizeNesCode } from "../../src/editors/nes/codes.ts";
import { type DisplayText, MessageError, message } from "../../src/shared/messages.ts";

export interface NesRule {
  name: DisplayText;
  code: string;
  enabled: boolean;
}

/** A word lock or a multi-part Game Genie entry must switch all its codes together. */
export function nesCodeGroup(raw: string): string[] | null {
  if (raw.length > maxNesCodes * 32) return null;
  const parts = raw.split("+");
  if (parts.length > maxNesCodes) return null;
  const codes = new Set<string>();
  for (const part of parts) {
    const code = normalizeNesCode(part);
    if (!code) return null;
    codes.add(code);
  }
  return [...codes];
}

/** Validate the complete set before changing either the view or the running core. */
export function activeNesCodes(rules: readonly NesRule[]): string[] {
  if (rules.length > maxNesCodes) throw new MessageError(message("nesCheats.limit"));
  const groups = new Set<string>();
  const enabled = new Set<string>();
  const addresses = new Map<string, string>();
  for (const rule of rules) {
    const codes = nesCodeGroup(rule.code);
    if (!codes || groups.has(codes.join("+")))
      throw new MessageError(message("nesCheats.invalidCode"));
    groups.add(codes.join("+"));
    if (!rule.enabled) continue;
    for (const code of codes) {
      if (code.includes(":")) {
        const address = code.slice(0, 4);
        const other = addresses.get(address);
        if (other && other !== code) throw new MessageError(message("nesCheats.overlap"));
        addresses.set(address, code);
      }
      enabled.add(code);
    }
  }
  if (enabled.size > maxNesCodes) throw new MessageError(message("nesCheats.limit"));
  return [...enabled];
}
