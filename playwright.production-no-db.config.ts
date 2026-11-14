import { defineConfig, devices } from "@playwright/test"

/** Exercise the public production error state with no database connection. No writes. */
export default defineConfig({
  testDir: "./visual",
  testMatch: /phase-01-no-db\.spec\.ts/,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3300",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "npm run dev -- --port 3300",
    url: "http://localhost:3300",
    env: {
      VERCEL_ENV: "production",
      DATABASE_URL: "",
      UI_VISUAL_FIXTURES: "0",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
