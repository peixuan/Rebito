export const supportedLocales = ["en", "zh-CN"] as const;
export type Locale = (typeof supportedLocales)[number];
export const localeStorageKey = "rebito.locale";

/** Stored choices are exact; browser language tags may include regional subtags. */
export function preferredLocale(stored: string | null, languages: readonly string[]): Locale {
  if (stored === "en" || stored === "zh-CN") return stored;
  for (const language of languages) {
    if (/^zh(?:-|$)/i.test(language)) return "zh-CN";
    if (/^en(?:-|$)/i.test(language)) return "en";
  }
  return "en";
}

export function browserLocale(): Locale {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(localeStorageKey);
  } catch {
    // Storage may be unavailable in a privacy-restricted browser.
  }
  return preferredLocale(stored, navigator.languages);
}
