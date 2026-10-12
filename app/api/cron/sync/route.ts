import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { getCurrentFantasyWeek } from "@/lib/season-calendar"
import { prisma } from "@/lib/prisma"
import { getManagerSession } from "@/lib/auth-session"
import {
  enforceRosterLocks,
  syncActiveGameBoxscores,
  recomputeMatchupsThroughWeek,
  syncLeagueWeek,
  syncScheduleForWeeks,
} from "@/lib/services/nhl-sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function runSync(request: NextRequest) {
  const startedAt = Date.now()
  const requestHeaders = await headers()
  const configuredSecret = process.env.CRON_SECRET
  const session = await getManagerSession()
  const commissioner = session
    ? await prisma.user.findUnique({ where: { id: session.managerId }, select: { isCommissioner: true } })
    : null
  const commissionerAuthorized = commissioner?.isCommissioner === true
  const bearerAuthorized = requestHeaders.get("authorization") === `Bearer ${configuredSecret}`
  const queryAuthorized = request.nextUrl.searchParams.get("secret") === configuredSecret
  if (!bearerAuthorized && !queryAuthorized && !commissionerAuthorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // ?backfill=1 pulls the whole season so far; otherwise just last, this and next week.
  const backfill = request.nextUrl.searchParams.get("backfill") === "1"
  const leagues = await prisma.league.findMany({ select: { id: true, currentSeason: true } })
  let scheduledGames = 0
  for (const league of leagues) {
    const week = getCurrentFantasyWeek(league.currentSeason)
    const weeks = backfill
      ? Array.from({ length: week + 1 }, (_, index) => index + 1)
      : [Math.max(1, week - 1), week, week + 1]
    scheduledGames += await syncScheduleForWeeks(league.currentSeason, weeks)
  }
  const processedGames = await syncActiveGameBoxscores(backfill ? 400 : 40)
  await enforceRosterLocks()

  for (const league of leagues) {
    const week = (await syncLeagueWeek(league.id)) ?? 1
    await recomputeMatchupsThroughWeek(league.id, week)
  }

  return NextResponse.json({
    success: true,
    processedGames: Math.max(scheduledGames, processedGames),
    durationMs: Date.now() - startedAt,
  })
}

export async function GET(request: NextRequest) {
  return runSync(request)
}

export async function POST(request: NextRequest) {
  return runSync(request)
}
