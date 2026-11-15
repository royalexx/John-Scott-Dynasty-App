/**
 * Phase 13 database doctor. All database operations are read-only; this script
 * does not fetch PIN plaintext, print hashes, migrate, seed, or alter sessions.
 * Usage: npm run league:readiness
 */
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { PrismaClient } from "@prisma/client"
import { getMatchupsForWeek } from "../lib/hockey-data"
import { isHashedManagerPin, verifyManagerPin } from "../lib/pin-crypto"

const LEAGUE_ID = "00000000-0000-0000-0000-000000000001"
const SEASON_WEEKS = 24
const requiredTables = ["User", "League", "Team", "Player", "RosterSlot", "Matchup", "_prisma_migrations"]
const expectedMigrations = readdirSync(join(process.cwd(), "prisma", "migrations"), { withFileTypes: true })
  .filter((file) => file.isDirectory() && /^\d{14}_/.test(file.name))
  .map((file) => file.name).sort()

type MigrationRow = { name: string; applied: boolean; rolled_back: boolean }
type TableRow = { name: string }
type CountRow = { count: number }

function report(verdict: string, issues: string[], counts: Record<string, number>, details: Record<string, unknown>) {
  console.log(JSON.stringify({ mode: "read_only", verdict, ready: verdict === "READY", issues, counts, ...details }, null, 2))
  if (verdict !== "READY") process.exitCode = 1
}

async function main() {
  if (!process.env.DATABASE_URL) {
    report("DATABASE_NOT_CONFIGURED", ["DATABASE_URL is not configured for this process"], {}, {})
    return
  }
  const db = new PrismaClient()
  try {
    const tables = await db.$queryRaw<TableRow[]>`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
    `
    const available = new Set(tables.map((row) => row.name))
    const missingTables = requiredTables.filter((name) => !available.has(name))
    if (missingTables.length > 0) {
      report("SCHEMA_NOT_READY", ["Missing required tables or Prisma migration history"], {}, { missingTables })
      return
    }

    const migrations = await db.$queryRaw<MigrationRow[]>`
      SELECT migration_name AS name,
        (finished_at IS NOT NULL) AS applied,
        (rolled_back_at IS NOT NULL) AS rolled_back
      FROM "_prisma_migrations" ORDER BY started_at ASC
    `
    const applied = new Set(migrations.filter((row) => row.applied && !row.rolled_back).map((row) => row.name))
    const pending = expectedMigrations.filter((name) => !applied.has(name))
    const incomplete = migrations.filter((row) => !row.applied && !row.rolled_back).length
    const unknown = migrations.filter((row) => !expectedMigrations.includes(row.name)).length
    const pinDefault = await db.$queryRaw<Array<{ default: string | null }>>`
      SELECT column_default AS "default" FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'User' AND column_name = 'pin'
    `

    // No mutations; collect only the minimum private fields needed to verify
    // that PINs are hashed and demo credentials were replaced. Never print them.
    const [leagueCount, league, registryPlayers, rosterCount, wrongLeagueRows] = await Promise.all([
      db.league.count(),
      db.league.findUnique({
        where: { id: LEAGUE_ID },
        select: {
          currentSeason: true,
          currentWeek: true,
          teams: { select: {
            id: true, managerId: true, name: true,
            manager: { select: { pin: true, email: true, isCommissioner: true } },
          } },
          matchups: { select: { season: true, week: true, homeTeamId: true, awayTeamId: true } },
        },
      }),
      db.player.count(),
      db.rosterSlot.count(),
      db.$queryRaw<CountRow[]>`
        SELECT count(*)::integer AS count FROM "RosterSlot" s
        JOIN "Team" t ON t.id = s."teamId"
        WHERE s."leagueId" <> t."leagueId"
      `,
    ])

    const issues: string[] = []
    if (pending.length || incomplete || unknown) issues.push("Migrations are pending, incomplete or unrecognized")
    if (pinDefault[0]?.default != null) issues.push("Legacy default PIN is still configured in schema")
    if (!league) issues.push("The canonical league record has not been initialized")
    if (leagueCount !== 1) issues.push("Expected one configured league")
    const teams = league?.teams ?? []
    const expectedNames = new Set(getMatchupsForWeek(1).flatMap((matchup) => [matchup.homeTeam, matchup.awayTeam]))
    if (teams.length !== expectedNames.size || teams.some((team) => !expectedNames.has(team.name))) {
      issues.push("League teams differ from the canonical matchup schedule")
    }
    if (new Set(teams.map((team) => team.managerId)).size !== teams.length) issues.push("Managers must be assigned to unique teams")
    if (teams.filter((team) => team.manager.isCommissioner).length !== 1) issues.push("Exactly one commissioner is required")
    const unhashedPins = teams.filter((team) => !isHashedManagerPin(team.manager.pin)).length
    const sharedFixturePins = teams.filter((team) => verifyManagerPin(team.manager.pin, "1234")).length
    const placeholderEmails = teams.filter((team) => team.manager.email.toLowerCase().endsWith("@example.com")).length
    if (unhashedPins) issues.push("Some manager PINs are not salted hashes")
    if (sharedFixturePins) issues.push("Default fixture PIN 1234 is still assigned to managers")
    if (placeholderEmails) issues.push("Demo manager email addresses have not been replaced")
    if ((wrongLeagueRows[0]?.count ?? 0) > 0) issues.push("Roster rows reference a different league than their team")

    let scheduleDifferences = 0
    if (league) {
      const byTeam = new Map(teams.map((team) => [team.name, team.id]))
      const schedule = new Set(league.matchups.filter((m) => m.season === league.currentSeason)
        .map((m) => `${m.week}:${m.homeTeamId}:${m.awayTeamId}`))
      for (let week = 1; week <= SEASON_WEEKS; week++) {
        for (const pair of getMatchupsForWeek(week)) {
          const home = byTeam.get(pair.homeTeam)
          const away = byTeam.get(pair.awayTeam)
          if (!home || !away || !schedule.has(`${week}:${home}:${away}`)) scheduleDifferences++
        }
      }
      if (league.matchups.filter((m) => m.season === league.currentSeason).length !== SEASON_WEEKS * 6) scheduleDifferences++
      if (scheduleDifferences) issues.push("League fixtures are incomplete or do not match the Match tab schedule")
    }

    const counts = {
      leagues: leagueCount,
      teams: teams.length,
      managers: new Set(teams.map((team) => team.managerId)).size,
      rosterSlots: rosterCount,
      registryPlayers,
      seasonMatchups: league?.matchups.filter((m) => m.season === league.currentSeason).length ?? 0,
    }
    const verdict = pending.length || incomplete || unknown || pinDefault[0]?.default != null
      ? "MIGRATIONS_REQUIRE_REVIEW"
      : !league ? "LEAGUE_NOT_INITIALIZED"
      : issues.length ? "LEAGUE_REQUIRES_REVIEW" : "READY"
    report(verdict, issues, counts, {
      migration: { pendingCount: pending.length, incompleteCount: incomplete, unknownCount: unknown },
      managerCredentials: { unhashedCount: unhashedPins, fixturePinCount: sharedFixturePins, placeholderEmailCount: placeholderEmails },
      scheduleDifferences,
      rosterLeagueMismatches: wrongLeagueRows[0]?.count ?? 0,
      note: "READY validates schema and league configuration; it does not establish that NHL game statistics have been synchronized.",
    })
  } finally {
    await db.$disconnect()
  }
}

main().catch((error: unknown) => {
  // Never include connection strings or the original query in output.
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code).slice(0, 30)
    : "UNKNOWN"
  console.error("Read-only league inspection could not finish. Prisma error code: " + code)
  process.exitCode = 1
})
