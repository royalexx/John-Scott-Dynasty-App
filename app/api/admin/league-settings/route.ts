import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getManagerSession } from "@/lib/auth-session"
import { rescoreAllStats, recomputeMatchupsThroughWeek } from "@/lib/services/nhl-sync"
import { getCurrentFantasyWeek } from "@/lib/season-calendar"
import { getLockSummary } from "@/lib/services/lineup-locks"
import type { LeagueScoring } from "@/lib/scoring"

/** Scoring weights and roster shape lock once week 1 has started. */
export async function isSeasonStructureLocked(season: number, lineupLockMode: unknown, now: Date = new Date()) {
  const week = getCurrentFantasyWeek(season, now)
  if (week > 1) return true
  const lock = await getLockSummary(season, lineupLockMode, now)
  return lock.weekStarted
}

const DEFAULT_LEAGUE_ID = "00000000-0000-0000-0000-000000000001"
const jsonFields = ["rosterPositions", "scoringSettings", "waiverSettings", "tradeSettings", "draftSettings"] as const
const ROSTER_POSITION_KEYS = new Set(["C", "W", "F", "D", "G", "BN"])

function scoringChanged(previous: unknown, next: unknown) {
  const before = previous && typeof previous === "object" && !Array.isArray(previous) ? previous as Record<string, unknown> : {}
  const after = next && typeof next === "object" && !Array.isArray(next) ? next as Record<string, unknown> : {}
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of keys) {
    if (before[key] !== after[key]) return true
  }
  return false
}

async function resolveLeagueId(teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { leagueId: true } })
  return team?.leagueId ?? DEFAULT_LEAGUE_ID
}

async function getLeague(leagueId: string) {
  return prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true, name: true, currentSeason: true, currentWeek: true, rosterSize: true, taxiSlots: true, taxiMaxGames: true, irSlots: true, lineupLockMode: true,
      scoringSettings: true, rosterPositions: true, waiverSettings: true, tradeSettings: true, draftSettings: true,
    },
  })
}

async function commissionerSession() {
  const session = await getManagerSession()
  if (!session) return null
  const user = await prisma.user.findUnique({ where: { id: session.managerId }, select: { isCommissioner: true } })
  return user?.isCommissioner ? session : null
}

export async function GET() {
  const session = await getManagerSession()
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 })
  const league = await getLeague(await resolveLeagueId(session.teamId))
  if (!league) return NextResponse.json({ error: "League not found." }, { status: 404 })
  const structureLocked = await isSeasonStructureLocked(league.currentSeason, league.lineupLockMode)
  return NextResponse.json({ ...league, structureLocked })
}

export async function PATCH(request: Request) {
  const session = await commissionerSession()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 })
  const data: Record<string, unknown> = {}
  for (const field of jsonFields) {
    if (field in body) {
      if (typeof body[field] !== "object" || body[field] === null || Array.isArray(body[field])) {
        return NextResponse.json({ error: `${field} must be an object.` }, { status: 400 })
      }
      data[field] = body[field]
    }
  }
  for (const field of ["taxiSlots", "taxiMaxGames", "irSlots"]) {
    if (field in body) {
      if (typeof body[field] !== "number" || !Number.isInteger(body[field]) || body[field] < 0) {
        return NextResponse.json({ error: `${field} must be a non-negative integer.` }, { status: 400 })
      }
      data[field] = body[field]
    }
  }
  // currentWeek follows the NHL calendar and cannot be set by hand.
  if ("lineupLockMode" in body) {
    if (body.lineupLockMode !== "WEEKLY" && body.lineupLockMode !== "DAILY") {
      return NextResponse.json({ error: "lineupLockMode must be WEEKLY or DAILY." }, { status: 400 })
    }
    data.lineupLockMode = body.lineupLockMode
  }
  const leagueId = await resolveLeagueId(session.teamId)
  const existing = await getLeague(leagueId)
  if (!existing) return NextResponse.json({ error: "League not found." }, { status: 404 })
  if (await isSeasonStructureLocked(existing.currentSeason, existing.lineupLockMode)) {
    delete data.rosterPositions
    delete data.scoringSettings
    delete data.taxiSlots
    delete data.taxiMaxGames
    delete data.irSlots
  }
  // Roster capacity always follows the configured slots, independent of which other fields were sent.
  if (data.rosterPositions) {
    const positions = data.rosterPositions as Record<string, unknown>
    if (Object.keys(positions).some((key) => !ROSTER_POSITION_KEYS.has(key))) {
      return NextResponse.json({ error: "rosterPositions keys must be C, W, F, D, G, or BN." }, { status: 400 })
    }
    const values = Object.values(positions)
    if (values.some((value) => typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
      return NextResponse.json({ error: "rosterPositions values must be non-negative integers." }, { status: 400 })
    }
    data.rosterSize = (values as number[]).reduce((total, value) => total + value, 0)
  }
  if (data.scoringSettings) {
    const scoring = Object.values(data.scoringSettings as Record<string, unknown>)
    if (scoring.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      return NextResponse.json({ error: "scoringSettings values must be finite numbers." }, { status: 400 })
    }
  }
  const scoringUpdated = Boolean(data.scoringSettings) && scoringChanged(existing.scoringSettings, data.scoringSettings)
  const league = await prisma.league.update({ where: { id: leagueId }, data, select: {
    id: true, name: true, currentSeason: true, currentWeek: true, rosterSize: true, taxiSlots: true, taxiMaxGames: true, irSlots: true, lineupLockMode: true,
    scoringSettings: true, rosterPositions: true, waiverSettings: true, tradeSettings: true, draftSettings: true,
  } })
  const structureLocked = await isSeasonStructureLocked(league.currentSeason, league.lineupLockMode)
  if (scoringUpdated && data.scoringSettings) {
    // Scoring changed: re-price every stat line and rebuild all matchup totals and standings from history.
    await rescoreAllStats(data.scoringSettings as LeagueScoring)
    await recomputeMatchupsThroughWeek(leagueId, getCurrentFantasyWeek(league.currentSeason))
  }
  return NextResponse.json({ ...league, structureLocked })
}
