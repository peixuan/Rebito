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
      50: "#eff4f8",
      100: "#e3edf4",
      200: "#c7d9e9",
      300: "#a9c5df",
      400: "#85a8c9",
      500: "#6088af",
      600: "#406c96",
      700: "#264f7a",
      800: "#213f60",
      900: "#19314b",
      950: "#142535",
    },
    colorScheme: {
      light: {
        primary: {
          color: "{primary.700}",
          hoverColor: "{primary.800}",
          activeColor: "{primary.900}",
        },
        content: { background: "#fffefa", borderColor: "#ccd3d6" },
        text: { color: "#203449", mutedColor: "#536579" },
      },
      dark: {
        primary: {
          color: "#b3cef0",
          contrastColor: "#152537",
          hoverColor: "#c7dbf0",
          activeColor: "#9bbfde",
        },
        content: { background: "#1e2b3b", borderColor: "#425567", hoverBackground: "#2c4157" },
        text: { color: "#edf1f7", mutedColor: "#b3c1d0" },
        formField: { background: "#1e2b3b", borderColor: "#56697b", color: "#edf1f7" },
      },
    },
  },
});

createApp(App)
  .use(i18n)
  .use(PrimeVue, {
    theme: { preset: neutral, options: { darkModeSelector: ".dark" } },
  })
  .mount("#app");
