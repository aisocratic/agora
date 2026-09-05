import { defineConfig, devices } from "@playwright/test"
export default defineConfig({
  testDir: "./tests/suggestions-e2e", workers: 1,
  use: { baseURL: "http://127.0.0.1:4291", channel: process.env.CI ? undefined : "chrome", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "desktop", use: devices["Desktop Chrome"] }, { name: "mobile", use: devices["Pixel 7"] }],
  webServer: { command: "node scripts/suggestions-test-server.mjs", url: "http://127.0.0.1:4291", reuseExistingServer: false, timeout: 60000, gracefulShutdown: { signal: "SIGTERM", timeout: 10000 } },
})
