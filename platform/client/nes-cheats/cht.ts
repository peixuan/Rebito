import { MessageError, message } from "../../src/shared/messages.ts";
import { nesCodeGroup } from "./rules.ts";

export interface CheatEntry {
  name: string;
  code: string;
}
export const maxCheatFileBytes = 256 * 1024;
const invalid = () => new MessageError(message("nesCheats.invalidFile"));

function unquote(value: string) {
  if (!value.startsWith('"')) return value;
  if (!value.endsWith('"') || value.length < 2) throw invalid();
  return value.slice(1, -1).replace(/\\(["\\])/g, "$1");
}

/** Only emulator-handled entries with complete, supported code groups are offered. */
export function readNesCheatFile(text: string, sha256: string) {
  if (text.length > maxCheatFileBytes) throw invalid();
  let count: number | undefined;
  const fields = new Map<number, Map<string, string>>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("# Rebito SHA-256:")) {
      if (line.slice("# Rebito SHA-256:".length).trim() !== sha256)
        throw new MessageError(message("nesCheats.wrongCartridge"));
      continue;
    }
    const size = /^cheats\s*=\s*(.+)$/.exec(line);
    if (size) {
      const value = unquote(size[1] ?? "");
      if (count !== undefined || !/^\d{1,4}$/.test(value)) throw invalid();
      count = Number(value);
      continue;
    }
    const match = /^cheat(\d{1,4})_(code|desc|handler)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const index = Number(match[1]);
    const key = match[2];
    if (!key || index >= 1024) throw invalid();
    const entry = fields.get(index) ?? new Map<string, string>();
    if (entry.has(key)) throw invalid();
    entry.set(key, unquote(match[3] ?? ""));
    fields.set(index, entry);
  }
  if (!count || count > 1024 || [...fields.keys()].some((i) => i >= count)) throw invalid();
  const entries: CheatEntry[] = [];
  for (let i = 0; i < count; i++) {
    const item = fields.get(i);
    if (!item || (item.has("handler") && item.get("handler") !== "0")) continue;
    const group = nesCodeGroup(item.get("code") ?? "");
    if (group)
      entries.push({ name: (item.get("desc") ?? "").slice(0, 160), code: group.join("+") });
  }
  return { entries, skipped: count - entries.length };
}

/** Export a release-bound list. Activation is an explicit action in each session. */
export function writeNesCheatFile(sha256: string, entries: readonly CheatEntry[]): string {
  const lines = [`# Rebito SHA-256: ${sha256}`, `cheats = ${entries.length}`];
  for (const [i, entry] of entries.entries()) {
    const desc = entry.name.replace(/[\r\n]/g, " ").replace(/["\\]/g, (char) => `\\${char}`);
    lines.push(
      "",
      `cheat${i}_desc = "${desc}"`,
      `cheat${i}_code = "${entry.code}"`,
      `cheat${i}_enable = false`,
    );
  }
  return lines.join("\n") + "\n";
}
