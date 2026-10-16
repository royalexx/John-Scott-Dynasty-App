import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getManagerSession } from "@/lib/auth-session"
import { weekLineupForLeague } from "@/lib/services/week-lineups"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const session = await getManagerSession()
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const week = Number(request.nextUrl.searchParams.get("week"))
  if (!Number.isInteger(week) || week < 1) return NextResponse.json({ error: "week is required" }, { status: 400 })
  const team = await prisma.team.findUnique({ where: { id: session.teamId }, select: { leagueId: true, league: { select: { currentSeason: true } } } })
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 })
  const lineup = await weekLineupForLeague(team.leagueId, team.league.currentSeason, week)
  return NextResponse.json(lineup)
}
