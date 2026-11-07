import { createI18n } from "vue-i18n";
import type { DisplayMessage, DisplayText } from "../src/shared/messages.ts";
import { browserLocale, type Locale, localeStorageKey } from "./locale-preference.ts";

const catalogs = import.meta.glob<Record<string, string>>("./locales/*/*.json", {
  eager: true,
  import: "default",
});
const messages: Record<Locale, Record<string, string>> = { en: {}, "zh-CN": {} };
for (const [path, catalog] of Object.entries(catalogs)) {
  const locale = path.split("/")[2];
  if (locale === "en" || locale === "zh-CN") Object.assign(messages[locale], catalog);
  if (locale === "shared") {
    Object.assign(messages.en, catalog);
    Object.assign(messages["zh-CN"], catalog);
  }
}

/** Catalogs are precompiled by Vite. No executable messages come from an API. */
export const i18n = createI18n({
  legacy: false,
  globalInjection: false,
  locale: browserLocale(),
  fallbackLocale: "en",
  messages,
  messageResolver: (catalog, key) => {
    if (typeof catalog !== "object" || catalog === null || !Object.hasOwn(catalog, key))
      return null;
    return (catalog as Record<string, string>)[key] ?? null;
  },
});

export const t = i18n.global.t;

export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale;
  try {
    localStorage.setItem(localeStorageKey, locale);
  } catch {
    // The in-memory preference still works when persistence is unavailable.
  }
}

export function translate(value: DisplayText | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (!i18n.global.te(value.messageId, "en")) return t("errors.request");
  const parameters = Object.fromEntries(
    Object.entries(value.parameters ?? {}).map(([key, parameter]) => [
      key,
      typeof parameter === "object" ? translate(parameter) : parameter,
    ]),
  );
  return t(value.messageId, parameters);
}

export type Localized<T> = T extends DisplayMessage
  ? string
  : T extends readonly (infer Item)[]
    ? Localized<Item>[]
    : T extends object
      ? { [Key in keyof T]: Localized<T[Key]> }
      : T;

/** Only presentation copies are localized; identifiers and draft values are retained. */
export function localize<T>(value: T): Localized<T> {
  if (value === null || typeof value !== "object") return value as Localized<T>;
  if ("messageId" in value) return translate(value as DisplayMessage) as Localized<T>;
  if (Array.isArray(value)) return value.map(localize) as Localized<T>;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, localize(item)]),
  ) as Localized<T>;
}

export function formatDate(value: string | number | Date, timeOnly = false): string {
  return new Intl.DateTimeFormat(
    i18n.global.locale.value,
    timeOnly ? { timeStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" },
  ).format(new Date(value));
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat(i18n.global.locale.value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
