/**
 * One-time, staging-only league provisioner.
 * Manager data and 4-digit PINs are read from standard input (never a file
 * or command-line argument), immediately hashed, and never printed.
 *
 * Default: validate JSON without database access.
 * Mutating operation: --apply plus explicit staging environment guards.
 */
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { PrismaClient, PlayerStatus, Position } from "@prisma/client"
import { getMatchupsForWeek } from "../lib/hockey-data"
import { DEFAULT_LEAGUE_SCORING } from "../lib/scoring"
import { getCurrentFantasyWeek } from "../lib/season-calendar"
import { hashManagerPin } from "../lib/pin-crypto"

const LEAGUE_ID = "00000000-0000-0000-0000-000000000001"
const EXPECTED_TEAMS = [...new Set(getMatchupsForWeek(1).flatMap((matchup) => [matchup.homeTeam, matchup.awayTeam]))]
type ManagerInput = {
  teamName: string
  managerName: string
  handle: string
  email: string
  pin: string
  isCommissioner: boolean
}
type RegistryEntry = {
  nhlId: number; name: string; team?: string; position?: string;
  headshot?: string; injuryStatus?: string | null; nhlGamesPlayed?: number;
  currentSeasonStats?: { gamesPlayed?: number } | null
}

function reject(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
async function inputFromStdin(): Promise<unknown> {
  let input = ""
  for await (const chunk of process.stdin) {
    input += chunk.toString("utf8")
    reject(input.length <= 64_000, "Manager configuration exceeds the permitted size")
  }
  reject(input.trim().length > 0, "Expected JSON manager configuration on standard input")
  try { return JSON.parse(input) as unknown }
  catch { throw new Error("Invalid manager JSON input") }
}

function validateConfig(value: unknown): ManagerInput[] {
  reject(value !== null && typeof value === "object" && !Array.isArray(value), "Configuration must be a JSON object")
  const data = value as Record<string, unknown>
  reject(Array.isArray(data.managers) && data.managers.length === EXPECTED_TEAMS.length,
    "Provide exactly 12 managers, one for each canonical league team")
  const managers = data.managers as unknown[]
  const cleaned = managers.map((record) => {
    reject(record !== null && typeof record === "object" && !Array.isArray(record), "Each manager must be a JSON object")
    const m = record as Record<string, unknown>
    reject(typeof m.teamName === "string" && EXPECTED_TEAMS.includes(m.teamName), "Unexpected team name")
    reject(typeof m.managerName === "string" && m.managerName.trim().length >= 2 && m.managerName.length <= 80, "Invalid manager name")
    reject(typeof m.handle === "string" && /^[a-zA-Z0-9_-]{2,40}$/.test(m.handle), "Manager handles must have 2-40 letters, numbers, underscore or dash")
    reject(typeof m.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email) && m.email.length <= 200 && !m.email.toLowerCase().endsWith("@example.com"), "Manager email must be valid and not a demo address")
    reject(typeof m.pin === "string" && /^\d{4}$/.test(m.pin) && m.pin !== "1234", "Each manager must have a private, non-demo 4-digit PIN")
    reject(typeof m.isCommissioner === "boolean", "Commissioner flag must be true or false")
    return {
      teamName: m.teamName,
      managerName: m.managerName.trim(),
      handle: m.handle,
      email: m.email.trim(),
      pin: m.pin,
      isCommissioner: m.isCommissioner,
    } as ManagerInput
  })
  reject(new Set(cleaned.map((m) => m.teamName)).size === EXPECTED_TEAMS.length, "Team names must be unique")
  reject(new Set(cleaned.map((m) => m.handle.toLowerCase())).size === cleaned.length, "Handles must be unique")
  reject(new Set(cleaned.map((m) => m.email.toLowerCase())).size === cleaned.length, "Emails must be unique")
  reject(new Set(cleaned.map((m) => m.pin)).size === cleaned.length, "Managers may not share a PIN")
  reject(cleaned.filter((m) => m.isCommissioner).length === 1, "Exactly one commissioner must be assigned")
  return cleaned
}

function guardStagingTarget() {
  reject(process.env.VERCEL_ENV !== "production" && process.env.NODE_ENV !== "production",
    "This provisioner is intentionally disabled in production")
  reject(process.env.LEAGUE_BOOTSTRAP_TARGET === "staging", "Only an explicitly configured staging database can be initialized")
  reject(process.env.LEAGUE_BOOTSTRAP_CONFIRM === "INITIALIZE_EMPTY_STAGING_LEAGUE", "Missing one-time staging initialization approval")
  reject(typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.length > 0, "DATABASE_URL is required")
  let host: string
  try { host = new URL(process.env.DATABASE_URL).hostname.toLowerCase() }
  catch { throw new Error("DATABASE_URL is not a valid PostgreSQL URL") }
  reject(host.length > 0, "DATABASE_URL has no hostname")
  const local = ["localhost", "127.0.0.1", "::1"].includes(host)
  reject(local || process.env.LEAGUE_BOOTSTRAP_APPROVED_HOST === host,
    "Remote staging hostname must be independently approved by the operator")
}

async function registryPlayers() {
  const data = JSON.parse(await readFile(join(process.cwd(), "public/data/nhl-players.json"), "utf8")) as RegistryEntry[]
  const seen = new Set<number>()
  const positions = new Set<string>(Object.values(Position))
  return data.filter((p) => Number.isInteger(p.nhlId) && p.nhlId > 0 && p.name && !seen.has(p.nhlId) && (seen.add(p.nhlId), true))
    .map((p) => ({
      id: p.nhlId, name: p.name, teamAbbrev: p.team ?? "NHL",
      position: positions.has(p.position ?? "") ? p.position as Position : Position.C,
      nhlGamesPlayed: p.nhlGamesPlayed ?? p.currentSeasonStats?.gamesPlayed ?? 0,
      injuryStatus: p.injuryStatus === "DTD" || p.injuryStatus === "O" || p.injuryStatus === "IR" ? p.injuryStatus as PlayerStatus : PlayerStatus.HEALTHY,
      headshotUrl: p.headshot ?? null,
    }))
}

async function main() {
  const managers = validateConfig(await inputFromStdin())
  const apply = process.argv.includes("--apply")
  reject(process.argv.every((arg) => arg !== "--force" && arg !== "--reset"), "Reset and force modes are forbidden")
  if (!apply) {
    console.log(JSON.stringify({ mode: "validation_only", valid: true, teams: managers.length,
      commissionerCount: 1, writes: 0, pinsExposed: false }))
    return
  }
  guardStagingTarget()
  const database = new PrismaClient()
  try {
    const registry = await registryPlayers()
    await database.$transaction(async (tx) => {
      // Serialize concurrent use of this provisioner on the same PostgreSQL DB.
      const lock = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(13132026) AS locked`
      reject(lock[0]?.locked === true, "Another league initialization is in progress")
      const counts = await Promise.all([
        tx.user.count(), tx.league.count(), tx.team.count(), tx.rosterSlot.count(),
        tx.matchup.count(), tx.draftPick.count(), tx.draft.count(), tx.tradeOffer.count(),
      ])
      reject(counts.every((count) => count === 0),
        "Refusing to initialize: the database already contains managers or league-related records")

      const league = await tx.league.create({
        data: {
          id: LEAGUE_ID,
          name: "John Scott Dynasty",
          currentSeason: 2026,
          currentWeek: getCurrentFantasyWeek(2026),
          rosterSize: 27, taxiSlots: 2, irSlots: 1, taxiMaxGames: 50,
          lineupLockMode: "WEEKLY",
          scoringSettings: { ...DEFAULT_LEAGUE_SCORING },
          rosterPositions: { C: 3, W: 6, F: 3, D: 6, G: 2, BN: 7 },
          waiverSettings: { type: "FAAB", faabBudget: 100, minBid: 0, holdHours: 48 },
          tradeSettings: { reviewType: "COMMISSIONER", reviewHours: 24, deadlineWeek: 18, allowPickTrading: true },
          draftSettings: { type: "LINEAR", rounds: 5, timerSeconds: 120, scheduledDate: "2027-08-15T18:00:00Z", orderType: "REVERSE_STANDINGS" },
        },
      })
      // Registry creation is non-destructive if the NHL sync already populated
      // the staging registry. Existing player metadata is never overwritten.
      await tx.player.createMany({ data: registry, skipDuplicates: true })
      const teamByName = new Map<string, string>()
      for (const [index, manager] of managers.entries()) {
        const user = await tx.user.create({
          data: {
            name: manager.managerName,
            handle: manager.handle,
            email: manager.email,
            isCommissioner: manager.isCommissioner,
            pin: hashManagerPin(manager.pin),
          },
        })
        const team = await tx.team.create({
          data: {
            leagueId: league.id, managerId: user.id,
            name: manager.teamName, waiverPriority: index + 1, faabBalance: 100,
          },
        })
        teamByName.set(manager.teamName, team.id)
      }
      const fixtures = Array.from({ length: 24 }, (_, index) => index + 1).flatMap((week) =>
        getMatchupsForWeek(week).map((matchup) => ({
          leagueId: league.id, season: 2026, week,
          homeTeamId: teamByName.get(matchup.homeTeam)!,
          awayTeamId: teamByName.get(matchup.awayTeam)!,
        })),
      )
      reject(fixtures.length === 144 && fixtures.every((fixture) => fixture.homeTeamId && fixture.awayTeamId),
        "The canonical matchup schedule is incomplete")
      await tx.matchup.createMany({ data: fixtures })
      const picks = [...teamByName.values()].flatMap((teamId) =>
        [2027, 2028, 2029].flatMap((season) =>
          [1, 2, 3, 4, 5].map((round) => ({
            leagueId: league.id, season, round, originalTeamId: teamId, currentTeamId: teamId,
          })),
        ),
      )
      await tx.draftPick.createMany({ data: picks })
    }, { maxWait: 15_000, timeout: 90_000 })
    console.log(JSON.stringify({ mode: "staging_initialized", teams: 12, matchups: 144,
      futureDraftPicks: 180, initialRosters: 0, pinsStoredAsSaltedHashes: true }))
  } finally {
    await database.$disconnect()
  }
}

main().catch(() => {
  // Avoid Prisma error strings: they may include the input and/or connection URL.
  console.error("Staging initialization refused or failed. No credential material was printed.")
  process.exitCode = 1
})
