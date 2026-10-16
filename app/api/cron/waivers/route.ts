import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { processWaiversForLeague } from "@/lib/services/transactions"
import { getManagerSession } from "@/lib/auth-session"
import { runInstantForProcessDate, waiverRunReadyForWeek } from "@/lib/waiver-run"
import { getFantasyWeekDates } from "@/lib/season-calendar"
import { ClaimStatus } from "@prisma/client"

export const runtime = "nodejs"

async function run(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET
  const session = await getManagerSession()
  const commissioner = session
    ? await prisma.user.findUnique({ where: { id: session.managerId }, select: { isCommissioner: true } })
    : null
  const commissionerAuthorized = commissioner?.isCommissioner === true
  const authorization = (await headers()).get("authorization")
  const authorized = authorization === `Bearer ${configuredSecret}` || request.nextUrl.searchParams.get("secret") === configuredSecret
  if (!authorized && !commissionerAuthorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const now = new Date()
  const leagueId = request.nextUrl.searchParams.get("leagueId")
  const leagues = leagueId
    ? await prisma.league.findMany({ where: { id: leagueId }, select: { id: true, currentSeason: true } })
    : await prisma.league.findMany({ select: { id: true, currentSeason: true } })

  const processed: Array<{ leagueId: string; count: number; week?: number; skipped?: string }> = []
  for (const league of leagues) {
    const dueDates = await prisma.waiverClaim.findMany({
      where: { status: ClaimStatus.PENDING, processDate: { lte: now }, team: { leagueId: league.id } },
      distinct: ["processDate"],
      orderBy: { processDate: "asc" },
      select: { processDate: true },
    })
    if (dueDates.length === 0) {
      processed.push({ leagueId: league.id, count: 0, skipped: "Waivers run Monday at midnight, after the final game of the week." })
      continue
    }
    let readyUntil: Date | null = null
    let blocked: string | null = null
    let closedWeek = 0
    for (const due of dueDates) {
      const scheduled = runInstantForProcessDate(league.currentSeason, due.processDate)
      const week = scheduled.week
      const { dates } = getFantasyWeekDates(week, league.currentSeason)
      const games = await prisma.nhlGame.findMany({ where: { gameDate: { in: dates } }, select: { gameState: true } })
      const gate = waiverRunReadyForWeek(league.currentSeason, week, games.map((game) => game.gameState), now)
      if (!gate.ready) {
        blocked = gate.reason
        break
      }
      readyUntil = scheduled.runAt
      closedWeek = week
    }
    if (!readyUntil) {
      processed.push({ leagueId: league.id, count: 0, skipped: blocked ?? "Waiting for the final game of the week." })
      continue
    }
    processed.push({ leagueId: league.id, week: closedWeek, count: await processWaiversForLeague(league.id, readyUntil) })
  }

  const awarded = processed.reduce((sum, result) => sum + result.count, 0)
  const waiting = processed.find((result) => result.skipped)
  const message = waiting && awarded === 0
    ? waiting.skipped
    : `Processed ${awarded} waiver claim${awarded === 1 ? "" : "s"}.`
  return NextResponse.json({ success: true, processed, message })
}

export async function GET(request: NextRequest) {
  return run(request)
}

export async function POST(request: NextRequest) {
  return run(request)
}
