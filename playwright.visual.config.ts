import { defineConfig, devices } from "@playwright/test"

/**
 * Read-only screenshot suite. The application is rendered from local fixtures
 * and browser API calls are intercepted in visual/baseline.spec.ts.
 * It intentionally does not execute auth.setup or the mutation-capable E2E suite.
 */
export default defineConfig({
  testDir: "./visual",
  testMatch: /baseline\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  outputDir: "test-results/visual",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-visual-report", open: "never" }],
  ],
  use: {
    baseURL: "http://localhost:3100",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    env: {
      UI_VISUAL_FIXTURES: "1",
      // Deliberately not a real database; all browser API requests are mocked.
      DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/ui_visual_unavailable",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
