import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

// This script is intentionally read-only. It guards a staged *code* release,
// not a hosted database migration or production Vercel deployment.
const backend = "a01da991a1a8fc66e71fda3dcb4d87ca0ceb3edd"
const approvedUi = "23839f4c14f31d24a3267e915769185030182406"
const rejectedUi = "639ecc689b5af0f5a96df11ecc2693784d7f9ebd"
const rejectedPhase11 = "2992627c962d89f033333e2ce3455dfc968fc9b5"
const check = (ok, message) => {
  if (!ok) throw new Error("Release candidate check failed: " + message)
  console.log("PASS: " + message)
}
const ancestor = (sha) => {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

check(ancestor(backend), "backend audit history retained")
check(ancestor(approvedUi), "Phase 7 UI history retained")
check(!ancestor(rejectedUi), "rejected Phase 4 redesign not inherited")
check(!ancestor(rejectedPhase11), "rejected Phase 11 matchup redesign not inherited")

for (const file of [
  "prisma/migrations/20261113000000_baseline/migration.sql",
  "prisma/migrations/20261113010000_login_throttle/migration.sql",
  "prisma/migrations/20261113020000_future_lineup_plans/migration.sql",
  "prisma/migrations/20261113030000_daily_game_lineups/migration.sql",
  "prisma/migrations/20261113040000_remove_legacy_pin_default/migration.sql",
  "scripts/migration-preflight.mjs",
  "scripts/league-readiness.ts",
  "scripts/bootstrap-league.ts",
  "scripts/phase13-integration-smoke.mjs",
  "lib/services/daily-game-lineups.ts",
  "lib/services/future-lineup-plans.ts",
  "components/hockey/player-portrait.tsx",
  "visual/phase-07.spec.ts",
  "playwright.preview.config.ts",
  "playwright.production-no-db.config.ts",
]) check(existsSync(file), `required release component: ${file}`)

const packageJson = JSON.parse(readFileSync("package.json", "utf8"))
check(!Object.hasOwn(packageJson.scripts, "prebuild"), "production build does not refresh NHL registry over network")
for (const command of ["test:e2e", "test:visual", "test:preview", "test:production-no-db"]) {
  check(Boolean(packageJson.scripts[command]), `test script: ${command}`)
}

const page = readFileSync("app/page.tsx", "utf8")
check(page.includes('import { LeagueUnavailable }'), "shared fail-closed unavailable screen imported")
check(!page.includes("function LeagueUnavailable()"), "shadow/duplicate unavailable screen absent")
check(page.includes("isPreviewFixture: true"), "database-free preview explicitly labeled")
const playwright = readFileSync("playwright.config.ts", "utf8")
check(playwright.includes("TEST_DATABASE_URL"), "mutating E2E requires independent PostgreSQL URL")
check(playwright.includes("reuseExistingServer: false"), "E2E does not attach to a running server")
const dashboard = readFileSync("app/dashboard-client.tsx", "utf8")
check(dashboard.includes('PlayerPortrait'), "NHL portrait components still referenced by the dashboard")
check(dashboard.includes("SwipePager"), "approved four-tab swipe navigation retained")
check(existsSync("components/hockey/league-unavailable.tsx"), "production never substitutes fixture scores for missing DB")

console.log("PASS: staged UI/backend release candidate passes code/history checks; no database or deployment was touched")
