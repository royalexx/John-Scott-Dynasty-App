/**
 * Read-only deployed PostgreSQL migration inventory.
 * Usage: DATABASE_URL=<redacted> node scripts/migration-preflight.mjs
 * Does NOT mutate database, mark migrations, log credentials, or print user data.
 */
import { PrismaClient } from "@prisma/client"

const requiredLegacyTables = [
  "User", "League", "Team", "Player", "RosterSlot",
  "Matchup", "WeekLineup", "NhlGame", "PlayerGameStat",
]
const expected = [
  "20261113000000_baseline",
  "20261113010000_login_throttle",
  "20261113020000_future_lineup_plans",
  "20261113030000_daily_game_lineups",
  "20261113040000_remove_legacy_pin_default",
]
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required (value will not be printed).")
  process.exit(1)
}
const db = new PrismaClient()
try {
  const tables = await db.$queryRaw`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
  `
  const names = new Set(tables.map((row) => row.name))
  const requiredMissing = requiredLegacyTables.filter((name) => !names.has(name))
  const pinColumn = await db.$queryRaw`
    SELECT column_default AS "default"
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'User' AND column_name = 'pin'
  `
  const counts = {}
  for (const table of ["User", "League", "Team", "RosterSlot", "Matchup"]) {
    if (!names.has(table)) continue
    // Static allowlist; no dynamic user-controlled identifiers.
    const rows = await db.$queryRawUnsafe(`SELECT count(*)::integer AS count FROM "${table}"`)
    counts[table] = rows[0]?.count ?? 0
  }
  const migrationRows = names.has("_prisma_migrations")
    ? await db.$queryRaw`
        SELECT migration_name AS name,
          (finished_at IS NOT NULL) AS applied,
          (rolled_back_at IS NOT NULL) AS rolled_back
        FROM "_prisma_migrations" ORDER BY started_at ASC
      `
    : []
  const appliedNames = new Set(migrationRows.filter((row) => row.applied && !row.rolled_back).map((row) => row.name))
  const incomplete = migrationRows.filter((row) => !row.applied && !row.rolled_back).map((row) => row.name)
  const unknown = migrationRows.map((row) => row.name).filter((name) => !expected.includes(name))
  const missingMigrations = expected.filter((name) => !appliedNames.has(name))
  const hasHistory = names.has("_prisma_migrations")
  const verdict = requiredMissing.length > 0 ? "UNEXPECTED_LEGACY_SCHEMA"
    : incomplete.length > 0 || unknown.length > 0 ? "MIGRATION_HISTORY_REQUIRES_REVIEW"
    : !hasHistory ? "UNBASELINED_POPULATED_SCHEMA"
    : missingMigrations.length > 0 ? "PENDING_MIGRATIONS"
    : pinColumn[0]?.default != null ? "LEGACY_PIN_DEFAULT_STILL_ACTIVE"
    : "HISTORY_READY"
  console.log(JSON.stringify({
    mode: "read_only", verdict, requiredMissing,
    rowCounts: counts, legacyPinColumnHasDefault: pinColumn[0]?.default != null,
    migrationHistoryExists: hasHistory, appliedMigrations: [...appliedNames],
    pendingMigrations: missingMigrations, incompleteMigrations: incomplete, unknownMigrations: unknown,
  }, null, 2))
  if (verdict === "UNEXPECTED_LEGACY_SCHEMA" || verdict === "MIGRATION_HISTORY_REQUIRES_REVIEW" || verdict === "LEGACY_PIN_DEFAULT_STILL_ACTIVE") {
    process.exitCode = 1
  }
} catch (error) {
  console.error("Read-only migration inspection failed:", error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await db.$disconnect()
}
