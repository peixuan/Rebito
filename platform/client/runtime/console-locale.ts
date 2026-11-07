import type { Locale } from "../locale-preference.ts";

/** The pinned upstream menu is built at startup. Changing the page locale never restarts a game. */
export async function consoleLocale(base: string, locale: Locale = "en") {
  if (locale === "en") return {};
  try {
    const response = await fetch(`${base}localization/zh-CN.json`);
    if (!response.ok) return {};
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
    const entries = Object.entries(data);
    if (!entries.every(([, value]) => typeof value === "string")) return {};
    return { language: locale, langJson: Object.fromEntries(entries) as Record<string, string> };
  } catch {
    // Translation availability is optional; the emulator's English menu remains usable.
    return {};
  }
}
