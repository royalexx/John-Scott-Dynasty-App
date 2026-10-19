import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentFantasyWeek, getEasternDate, getFantasyWeekDates, getFantasyWeekForDate } from "@/lib/season-calendar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type PlayerGameLogRecord = Record<string, string | number | null>

export async function GET(request: NextRequest) {
  try {
    const requestedDate = request.nextUrl.searchParams.get("date")
    const requestedWeek = Number(request.nextUrl.searchParams.get("week"))
    const easternToday = getEasternDate()
    const weekDates = Number.isInteger(requestedWeek) && requestedWeek > 0
      ? getFantasyWeekDates(requestedWeek).dates
      : getFantasyWeekDates(getFantasyWeekForDate(requestedDate ?? easternToday)).dates
    const today = requestedDate ?? (weekDates.includes(easternToday) ? easternToday : weekDates[0])
    const gameStatsInclude = { include: { player: { select: { teamAbbrev: true } } } }
    let games = await prisma.nhlGame.findMany({
      where: { gameDate: { in: weekDates } },
      include: { gameStats: gameStatsInclude },
      orderBy: { startTimeUTC: "asc" },
    })
    const missingStats = games.length === 0 || games.some((game) =>
      (game.gameState === "FINAL" || game.gameState === "OFF") && (
        game.gameStats.length === 0 || game.gameStats.every((stat) => stat.shots === 0)
      ),
    )
    if ((requestedWeek > 0 || weekDates.includes(easternToday)) && missingStats) {
      const { syncScheduleForDate, syncActiveGameBoxscores, recomputeMatchupsThroughWeek } = await import("@/lib/services/nhl-sync")
      if (games.length === 0) await syncScheduleForDate(weekDates[0])
      await syncActiveGameBoxscores(50)
      const leagues = await prisma.league.findMany({ select: { id: true, currentSeason: true } })
      for (const league of leagues) {
        await recomputeMatchupsThroughWeek(league.id, getCurrentFantasyWeek(league.currentSeason))
      }
      games = await prisma.nhlGame.findMany({
        where: { gameDate: { in: weekDates } },
        include: { gameStats: gameStatsInclude },
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
        const toi = stat.toi.trim()
        const unplayed = (toi === "0:00" || toi === "00:00" || toi === "") && !stat.decision
          && stat.goals + stat.assists + stat.shots + stat.hits + stat.blocks + stat.pim + Math.abs(stat.plusMinus)
            + stat.shotsAgainst + stat.goalsAgainst + stat.saves + stat.shutouts === 0
        if (unplayed) continue
        const logs = playerGameLogs[String(stat.playerId)] ?? []
        const teamAbbrev = stat.player?.teamAbbrev === game.awayTeamAbbrev ? game.awayTeamAbbrev : game.homeTeamAbbrev
        logs.push({
          gameId: game.id,
          gameDate: game.gameDate,
          teamAbbrev,
          opponentAbbrev: teamAbbrev === game.homeTeamAbbrev ? game.awayTeamAbbrev : game.homeTeamAbbrev,
          homeRoadFlag: teamAbbrev === game.homeTeamAbbrev ? "H" : "R",
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
