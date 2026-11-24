import { defineConfig, devices } from "@playwright/test"

/** Emulate a hosted Preview with an unreachable but configured PostgreSQL URL.
 * No demo page or fixture API endpoint may attempt to query this database.
 */
export default defineConfig({
  testDir: "./visual",
  testMatch: /(?:preview-readonly|phase-01|phase-02|phase-03|phase-05|phase-06|phase-07|phase-09|phase-10|phase-12|corner-smoothing-60)\.spec\.ts/,
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
      DATABASE_URL: "postgresql://preview-blocked:preview-blocked@127.0.0.1:1/never_connect",
      UI_VISUAL_FIXTURES: "0",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
