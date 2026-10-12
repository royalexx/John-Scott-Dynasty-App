import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getManagerSession } from "@/lib/auth-session"
import { rescoreAllStats, recomputeMatchupsThroughWeek } from "@/lib/services/nhl-sync"
import { getCurrentFantasyWeek } from "@/lib/season-calendar"
import type { LeagueScoring } from "@/lib/scoring"

const leagueId = "00000000-0000-0000-0000-000000000001"
const jsonFields = ["rosterPositions", "scoringSettings", "waiverSettings", "tradeSettings", "draftSettings"] as const

async function getLeague() {
  return prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true, name: true, currentWeek: true, rosterSize: true, taxiSlots: true, taxiMaxGames: true, irSlots: true, lineupLockMode: true,
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
  const league = await getLeague()
  return league ? NextResponse.json(league) : NextResponse.json({ error: "League not found." }, { status: 404 })
}

export async function PATCH(request: Request) {
  if (!await commissionerSession()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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
  // Roster capacity always follows the configured slots, independent of which other fields were sent.
  if (data.rosterPositions) {
    const positions = Object.values(data.rosterPositions as Record<string, unknown>)
    if (positions.some((value) => typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
      return NextResponse.json({ error: "rosterPositions values must be non-negative integers." }, { status: 400 })
    }
    data.rosterSize = (positions as number[]).reduce((total, value) => total + value, 0)
  }
  const league = await prisma.league.update({ where: { id: leagueId }, data, select: {
    id: true, name: true, currentWeek: true, rosterSize: true, taxiSlots: true, taxiMaxGames: true, irSlots: true, lineupLockMode: true,
    scoringSettings: true, rosterPositions: true, waiverSettings: true, tradeSettings: true, draftSettings: true,
  } })
  if (data.scoringSettings) {
    // Scoring changed: re-price every stat line and rebuild all matchup totals and standings from history.
    await rescoreAllStats(data.scoringSettings as LeagueScoring)
    await recomputeMatchupsThroughWeek(leagueId, getCurrentFantasyWeek())
  }
  return NextResponse.json(league)
}
