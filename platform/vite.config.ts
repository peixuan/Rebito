import { resolve } from "node:path";
import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    VueI18nPlugin({
      include: resolve("client/locales/**"),
      runtimeOnly: true,
      dropMessageCompiler: true,
      fullInstall: false,
    }),
    vue(),
  ],
  build: { outDir: "dist/client", emptyOutDir: true },
  server: { host: "127.0.0.1", proxy: { "/api": "http://127.0.0.1:3000" } },
});
