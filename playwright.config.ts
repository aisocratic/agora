import { defineConfig, devices } from "@playwright/test"
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    channel: process.env.CI ? undefined : "chrome",
  },
  projects: [
    {
      name: "pages-desktop",
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4188" },
    },
    { name: "pages-mobile", use: { ...devices["Pixel 7"], baseURL: "http://127.0.0.1:4188" } },
    {
      name: "app-desktop",
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4189" },
    },
  ],
  webServer: [
    {
      command: "pnpm site:build && python3 -m http.server 4188 --directory site",
      url: "http://127.0.0.1:4188",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: "pnpm build && pnpm start --port 4189",
      url: "http://127.0.0.1:4189",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
})
