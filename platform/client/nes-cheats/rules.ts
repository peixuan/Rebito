import { maxNesCodes, normalizeNesCode } from "../../src/editors/nes/codes.ts";
import { type DisplayText, MessageError, message } from "../../src/shared/messages.ts";

export interface NesRule {
  name: DisplayText;
  code: string;
  enabled: boolean;
}

/** Validate the complete set before changing either the view or the running core. */
export function activeNesCodes(rules: readonly NesRule[]): string[] {
  if (rules.length > maxNesCodes) throw new MessageError(message("nesCheats.limit"));
  const all = new Set<string>();
  const addresses = new Set<string>();
  const enabled = [];
  for (const rule of rules) {
    const code = normalizeNesCode(rule.code);
    if (!code || all.has(code)) throw new MessageError(message("nesCheats.invalidCode"));
    all.add(code);
    if (!rule.enabled) continue;
    if (code.includes(":")) {
      const address = code.slice(0, 4);
      if (addresses.has(address)) throw new MessageError(message("nesCheats.overlap"));
      addresses.add(address);
    }
    enabled.push(code);
  }
  return enabled;
}
