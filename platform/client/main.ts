import Aura from "@primeuix/themes/aura";
import PrimeVue from "primevue/config";
import { createApp } from "vue";
import App from "./App.vue";
import { i18n } from "./i18n.ts";

createApp(App)
  .use(i18n)
  .use(PrimeVue, {
    theme: { preset: Aura, options: { darkModeSelector: ".dark" } },
  })
  .mount("#app");
