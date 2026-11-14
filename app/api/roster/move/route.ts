import { NextRequest, NextResponse } from "next/server"
import { SlotType } from "@prisma/client"
import { updateRosterPlacement } from "@/lib/services/transactions"
import { getManagerSession } from "@/lib/auth-session"
import { prisma } from "@/lib/prisma"
import { getCurrentFantasyWeek, MAX_FANTASY_WEEK } from "@/lib/season-calendar"
import { activateDueLineupPlans, saveFutureLineupMove } from "@/lib/services/future-lineup-plans"
import { weekLineupForLeague } from "@/lib/services/week-lineups"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const session = await getManagerSession()
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  try {
    const body = await request.json() as { teamId?: string; playerId?: number; targetSlot?: string; targetPlayerId?: number; week?: number }
    if (!body.teamId || !Number.isInteger(body.playerId) || !body.targetSlot || !Object.values(SlotType).includes(body.targetSlot as SlotType)) {
      return NextResponse.json({ error: "teamId, playerId, and a valid targetSlot are required" }, { status: 400 })
    }
    if (body.teamId !== session.teamId) return NextResponse.json({ error: "You can only edit your own lineup" }, { status: 403 })
    if (body.targetPlayerId !== undefined && !Number.isInteger(body.targetPlayerId)) return NextResponse.json({ error: "targetPlayerId must be an integer" }, { status: 400 })
    if (body.week !== undefined && (!Number.isInteger(body.week) || body.week < 1 || body.week > MAX_FANTASY_WEEK)) return NextResponse.json({ error: "week must be an integer within the fantasy season" }, { status: 400 })
    const team = await prisma.team.findUnique({ where: { id: session.teamId }, select: { leagueId: true, league: { select: { currentSeason: true } } } })
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 })
    const current = getCurrentFantasyWeek(team.league.currentSeason)
    if (body.week !== undefined && body.week > current) {
      await saveFutureLineupMove(body.teamId, body.week, body.playerId as number, body.targetSlot as SlotType, body.targetPlayerId)
      return NextResponse.json({ planned: true, lineup: await weekLineupForLeague(team.leagueId, team.league.currentSeason, body.week) })
    }
    await activateDueLineupPlans(team.leagueId, team.league.currentSeason)
    const roster = await updateRosterPlacement(body.teamId, body.playerId as number, body.targetSlot as SlotType, body.targetPlayerId, body.week)
    return NextResponse.json({ roster })
  } catch (error: unknown) {
    console.error("Roster move failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Roster move failed" }, { status: 400 })
  }
}
