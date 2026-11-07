import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:4317",
    locale: "en-US",
    trace: "retain-on-failure",
    launchOptions: { chromiumSandbox: true },
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
  webServer: {
    command: "node tests/e2e/server.ts",
    url: "http://localhost:4317/health/ready",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
