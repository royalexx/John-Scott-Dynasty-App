import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
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
  const bearerAuthorized = requestHeaders.get("authorization") === `Bearer ${configuredSecret}`
  const queryAuthorized = request.nextUrl.searchParams.get("secret") === configuredSecret
  const developmentBypass = process.env.NODE_ENV === "development"
  if (!bearerAuthorized && !queryAuthorized && !developmentBypass) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
