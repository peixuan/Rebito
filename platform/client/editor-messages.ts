import { i18n } from "./i18n.ts";

// Loaded with the editor component, keeping large game vocabularies out of the account shell.
const catalogs = import.meta.glob<Record<string, string>>("./locales/*/editors/*.json", {
  eager: true,
  import: "default",
});
for (const [path, catalog] of Object.entries(catalogs)) {
  const locale = path.split("/")[2];
  if (locale === "en" || locale === "shared") i18n.global.mergeLocaleMessage("en", catalog);
  if (locale === "zh-CN" || locale === "shared") i18n.global.mergeLocaleMessage("zh-CN", catalog);
}
