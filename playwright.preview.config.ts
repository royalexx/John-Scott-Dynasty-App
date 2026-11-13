import { defineConfig, devices } from "@playwright/test"

/** No .env, no database, no accounts: emulates a hosted Vercel preview. */
export default defineConfig({
  testDir: "./visual",
  testMatch: /(?:preview-readonly|phase-01|phase-02|phase-03)\.spec\.ts/,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-preview-report" }]],
  use: {
    baseURL: "http://localhost:3200",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3200",
    url: "http://localhost:3200",
    env: {
      VERCEL_ENV: "preview",
      DATABASE_URL: "",
      UI_VISUAL_FIXTURES: "0",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
