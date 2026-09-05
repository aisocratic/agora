import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/shared-e2e",
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4290",
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/shared-test-server.mjs",
    url: "http://127.0.0.1:4290",
    reuseExistingServer: false,
    timeout: 60000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10000 },
  },
})
