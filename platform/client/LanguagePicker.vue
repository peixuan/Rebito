<script setup lang="ts">
import { usePrimeVue } from "primevue/config";
import { computed, watchEffect } from "vue";
import { i18n, setLocale, t } from "./i18n.ts";
import { primeVueLocale } from "./primevue-locale.ts";

const primevue = usePrimeVue();
const language = computed({
  get: () => i18n.global.locale.value,
  set: setLocale,
});
watchEffect(() => {
  document.documentElement.lang = language.value;
  document.title = t("app.brand");
  Object.assign(primevue.config.locale ?? {}, primeVueLocale());
});
</script>

<template>
  <select v-model="language" class="language-picker" :aria-label="t('app.language')">
    <option value="en">{{ t("app.english") }}</option>
    <option value="zh-CN">{{ t("app.chinese") }}</option>
  </select>
</template>

<style scoped>
.language-picker {
  max-width: 10rem;
  min-width: 0;
  padding: 5px;
  border: 1px solid var(--p-form-field-border-color);
  border-radius: var(--p-form-field-border-radius);
  background: var(--p-form-field-background);
  color: var(--p-form-field-color);
  font: inherit;
}
@media (max-width: 700px) {
  .language-picker {
    max-width: 6em;
    padding: 4px 0;
    font-size: 12px;
  }
}
</style>
