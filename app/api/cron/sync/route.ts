import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { getManagerSession } from "@/lib/auth-session"
import {
  enforceRosterLocks,
  syncActiveGameBoxscores,
  syncScheduleForDate,
  updateWeeklyMatchupScores,
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

  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
  const scheduledGames = await syncScheduleForDate(date)
  const processedGames = await syncActiveGameBoxscores()
  await enforceRosterLocks()

  const leagues = await prisma.league.findMany({
    select: { id: true, currentWeek: true },
  })
  for (const league of leagues) {
    await updateWeeklyMatchupScores(league.id, league.currentWeek)
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
