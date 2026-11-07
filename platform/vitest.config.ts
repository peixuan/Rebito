import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "scripts/*.test.mjs"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "client/api.ts", "client/runtime/progress.ts"],
      exclude: ["src/server/main.ts", "src/server/create-account.ts"],
      reporter: ["text", "lcov"],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
