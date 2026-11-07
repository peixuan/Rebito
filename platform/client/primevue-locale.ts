import type { PrimeVueLocaleOptions } from "primevue/config";
import { t } from "./i18n.ts";

/** Only the controls used by the application need overrides. Keep widget placeholders intact. */
export function primeVueLocale(): Partial<PrimeVueLocaleOptions> {
  return {
    emptyFilterMessage: t("widgets.noResults"),
    emptySearchMessage: t("widgets.noResults"),
    emptyMessage: t("widgets.noOptions"),
    searchMessage: t("widgets.searchResults", { count: "{0}" }),
    selectionMessage: t("widgets.selection", { count: "{0}" }),
    emptySelectionMessage: t("widgets.noSelection"),
    aria: {
      close: t("widgets.close"),
      selectAll: t("widgets.selectAll"),
      unselectAll: t("widgets.unselectAll"),
      selectRow: t("widgets.selectRow"),
      unselectRow: t("widgets.unselectRow"),
      listLabel: t("widgets.options"),
      navigation: t("widgets.navigation"),
      pageLabel: t("widgets.page", { page: "{page}" }),
      firstPageLabel: t("widgets.firstPage"),
      lastPageLabel: t("widgets.lastPage"),
      nextPageLabel: t("widgets.nextPage"),
      prevPageLabel: t("widgets.previousPage"),
      rowsPerPageLabel: t("widgets.rowsPerPage"),
      jumpToPageDropdownLabel: t("widgets.choosePage"),
      jumpToPageInputLabel: t("widgets.enterPage"),
    },
  };
}
