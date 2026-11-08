import { definePreset } from "@primeuix/themes";
import Aura from "@primeuix/themes/aura";
import PrimeVue from "primevue/config";
import { createApp } from "vue";
import App from "./App.vue";
import { i18n } from "./i18n.ts";
import "./style.css";

const neutral = definePreset(Aura, {
  semantic: {
    primary: {
      50: "{slate.50}",
      100: "{slate.100}",
      200: "{slate.200}",
      300: "{slate.300}",
      400: "{slate.400}",
      500: "{slate.500}",
      600: "{slate.600}",
      700: "{slate.700}",
      800: "{slate.800}",
      900: "{slate.900}",
      950: "{slate.950}",
    },
  },
});

createApp(App)
  .use(i18n)
  .use(PrimeVue, {
    theme: { preset: neutral, options: { darkModeSelector: ".dark" } },
  })
  .mount("#app");
