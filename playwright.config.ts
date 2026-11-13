import { defineConfig, devices } from "@playwright/test"
import { assertIsolatedE2EDatabase } from "./scripts/e2e-test-safety"

assertIsolatedE2EDatabase()

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      testMatch: /.*\.spec\.ts/,
      use: {
        storageState: "e2e/.auth/manager.json",
      },
    },
  ],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 430, height: 932 },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    // Never attach test automation to an already running, possibly production-backed server.
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
})
