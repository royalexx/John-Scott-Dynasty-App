import { defineConfig, devices } from "@playwright/test"

// Integration tests mutate league state. Never let them attach to a running
// production/dev server or read DATABASE_URL from a shared .env file.
const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (!testDatabaseUrl) {
  throw new Error("Refusing to start Playwright: set TEST_DATABASE_URL to a dedicated local PostgreSQL test database.")
}
let parsedUrl: URL
try {
  parsedUrl = new URL(testDatabaseUrl)
} catch {
  throw new Error("TEST_DATABASE_URL is not a valid PostgreSQL connection URL.")
}
if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
  throw new Error("TEST_DATABASE_URL must be a PostgreSQL URL.")
}
if (!["localhost", "127.0.0.1", "[::1]"].includes(parsedUrl.hostname)) {
  throw new Error("Playwright requires a LOCAL PostgreSQL test database; remote DB hosts are forbidden.")
}
const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ""))
if (!/(^|[_-])(test|e2e)([_-]|$)/i.test(databaseName)) {
  throw new Error("TEST_DATABASE_URL must use a database whose name includes 'test' or 'e2e'.")
}
if (process.env.DATABASE_URL && process.env.DATABASE_URL === testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL must differ from the application's existing DATABASE_URL.")
}
// Apply to both Playwright's own Prisma clients and the isolated Next.js server.
process.env.DATABASE_URL = testDatabaseUrl

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
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 430, height: 932 },
  },
  webServer: {
    command: "npm run dev -- --hostname localhost --port 3100",
    url: "http://localhost:3100",
    env: {
      DATABASE_URL: testDatabaseUrl,
      // Stable test-only signing key; never load production secrets from .env.
      SESSION_SECRET: "e2e-local-only-session-secret-not-for-production-2026",
    },
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
})
