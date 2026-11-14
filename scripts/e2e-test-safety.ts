import { existsSync } from "node:fs"

/**
 * The old E2E suite contains writes (roster moves, rulebook PATCH, cron sync).
 * Fail CLOSED unless the browser and the server are attached to an explicitly
 * named loopback test database. Never print database credentials.
 */
export function assertIsolatedE2EDatabase() {
  if (existsSync(".env")) {
    process.loadEnvFile?.(".env")
  }

  if (process.env.E2E_ALLOW_MUTATION !== "1") {
    throw new Error("Full E2E tests are disabled. Set E2E_ALLOW_MUTATION=1 with a local *_e2e or *_test PostgreSQL database.")
  }
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    throw new Error("Full E2E tests must not execute inside a Vercel deployment.")
  }

  let url: URL
  try {
    url = new URL(process.env.DATABASE_URL ?? "")
  } catch {
    throw new Error("Full E2E tests require an explicit local PostgreSQL DATABASE_URL.")
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  const dbName = decodeURIComponent(url.pathname.replace(/^\/+/, ""))
  const namedForTests = /(?:_e2e|_test)(?:_[a-z0-9]+)?$/i.test(dbName)
  const postgres = url.protocol === "postgresql:" || url.protocol === "postgres:"
  if (!postgres || !local || !namedForTests) {
    throw new Error("Refusing E2E against a non-local or non-test database. Use a loopback PostgreSQL URL ending in *_e2e or *_test.")
  }
}
