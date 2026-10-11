import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getFantasyWeekDates } from "@/lib/season-calendar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type PlayerGameLogRecord = Record<string, string | number | null>

function getWeekDates(dateInput: string | null) {
  const base = dateInput ? new Date(`${dateInput}T12:00:00Z`) : new Date()
  const monday = new Date(base)
  monday.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setUTCDate(monday.getUTCDate() + index)
    return date.toISOString().slice(0, 10)
  })
}

export async function GET(request: NextRequest) {
  try {
    const requestedDate = request.nextUrl.searchParams.get("date")
    const requestedWeek = Number(request.nextUrl.searchParams.get("week"))
    const weekDates = Number.isInteger(requestedWeek) && requestedWeek > 0
      ? getFantasyWeekDates(requestedWeek).dates
      : getWeekDates(requestedDate)
    const today = requestedDate ?? (weekDates.includes(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()))
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
      : weekDates[0])
    let games = await prisma.nhlGame.findMany({
      where: { gameDate: { in: weekDates } },
      include: { gameStats: true },
      orderBy: { startTimeUTC: "asc" },
    })
    if (requestedWeek > 0 && games.length === 0) {
      const { syncScheduleForDate } = await import("@/lib/services/nhl-sync")
      await syncScheduleForDate(weekDates[0])
      games = await prisma.nhlGame.findMany({
        where: { gameDate: { in: weekDates } },
        include: { gameStats: true },
        orderBy: { startTimeUTC: "asc" },
      })
    }

    const mappedGames = games.map((game) => ({
      id: game.id,
      date: game.gameDate,
      day: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${game.gameDate}T12:00:00Z`)),
      gameState: game.gameState,
      startTimeUTC: game.startTimeUTC.toISOString(),
      awayTeam: { abbrev: game.awayTeamAbbrev, score: game.awayScore },
      homeTeam: { abbrev: game.homeTeamAbbrev, score: game.homeScore },
      period: game.period,
      clock: game.clock,
    }))

    const playerGameLogs: Record<string, PlayerGameLogRecord[]> = {}
    for (const game of games) {
      for (const stat of game.gameStats) {
        const logs = playerGameLogs[String(stat.playerId)] ?? []
        logs.push({
          gameId: game.id,
          gameDate: game.gameDate,
          goals: stat.goals,
          assists: stat.assists,
          shots: stat.shots,
          hits: stat.hits,
          blocks: stat.blocks,
          pim: stat.pim,
          points: stat.goals + stat.assists,
          plusMinus: stat.plusMinus,
          powerPlayPoints: stat.powerPlayPoints,
          shorthandedGoals: stat.shorthandedGoals,
          gameWinningGoals: stat.gameWinningGoals,
          toi: stat.toi,
          decision: stat.decision,
          shotsAgainst: stat.shotsAgainst,
          goalsAgainst: stat.goalsAgainst,
          saves: stat.saves,
          savePctg: stat.savePct,
          shutouts: stat.shutouts,
          fantasyPoints: stat.fantasyPoints,
        })
        playerGameLogs[String(stat.playerId)] = logs
      }
    }

    return NextResponse.json({
      date: games.some((game) => game.gameDate === today) ? today : games[0]?.gameDate ?? today,
      games: mappedGames.filter((game) => game.date === today),
      weekGames: mappedGames,
      playerGameLogs,
    })
  } catch (error: unknown) {
    console.error("Could not retrieve persisted NHL schedule", error)
    return NextResponse.json({ error: "Could not retrieve NHL schedule", games: [], weekGames: [], playerGameLogs: {} }, { status: 500 })
  }
}
