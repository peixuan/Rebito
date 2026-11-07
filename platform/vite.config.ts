import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vue(),
    VueI18nPlugin({
      include: resolve("client/locales/**"),
      runtimeOnly: true,
      dropMessageCompiler: true,
      fullInstall: false,
    }),
  ],
  publicDir: ".runtime-cache/public",
  define: {
    __RUNTIME_FINGERPRINT__: JSON.stringify(
      createHash("sha256")
        .update(JSON.stringify(JSON.parse(readFileSync("runtime-lock.json", "utf8"))))
        .digest("hex"),
    ),
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    rolldownOptions: { input: ["index.html", "runtime.html"] },
  },
  server: { host: "127.0.0.1", proxy: { "/api": "http://127.0.0.1:3000" } },
});
