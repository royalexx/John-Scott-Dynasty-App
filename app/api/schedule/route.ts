import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getEasternDate, getFantasyWeekDates, getFantasyWeekForDate } from "@/lib/season-calendar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type PlayerGameLogRecord = Record<string, string | number | null>

/** Empty-week schedule seeds share one NHL call, then skip that week for five minutes. */
const SCHEDULE_SYNC_COOLDOWN_MS = 5 * 60 * 1000
const inFlightScheduleSync = new Map<string, Promise<number>>()
const scheduleSyncCooldownUntil = new Map<string, number>()

function syncEmptyWeekOnce(weekKey: string, date: string): Promise<number> {
  const inFlight = inFlightScheduleSync.get(weekKey)
  if (inFlight) return inFlight
  if ((scheduleSyncCooldownUntil.get(weekKey) ?? 0) > Date.now()) return Promise.resolve(0)

  const flight = import("@/lib/services/nhl-sync")
    .then(({ syncScheduleForDate }) => syncScheduleForDate(date))
    .finally(() => {
      inFlightScheduleSync.delete(weekKey)
      scheduleSyncCooldownUntil.set(weekKey, Date.now() + SCHEDULE_SYNC_COOLDOWN_MS)
    })
  inFlightScheduleSync.set(weekKey, flight)
  return flight
}

export async function GET(request: NextRequest) {
  try {
    const requestedDate = request.nextUrl.searchParams.get("date")
    const requestedWeek = Number(request.nextUrl.searchParams.get("week"))
    const easternToday = getEasternDate()
    const fantasyWeek = Number.isInteger(requestedWeek) && requestedWeek > 0
      ? requestedWeek
      : getFantasyWeekForDate(requestedDate ?? easternToday)
    const weekDates = getFantasyWeekDates(fantasyWeek).dates
    const today = requestedDate ?? (weekDates.includes(easternToday) ? easternToday : weekDates[0])
    const gameStatsInclude = { include: { player: { select: { teamAbbrev: true } } } }
    let games = await prisma.nhlGame.findMany({
      where: { gameDate: { in: weekDates } },
      include: { gameStats: gameStatsInclude },
      orderBy: { startTimeUTC: "asc" },
    })
    // Stored weeks are served as-is. Cron owns boxscores and matchup scoring.
    if (games.length === 0) {
      const synced = await syncEmptyWeekOnce(String(fantasyWeek), weekDates[0])
      if (synced > 0) {
        games = await prisma.nhlGame.findMany({
          where: { gameDate: { in: weekDates } },
          include: { gameStats: gameStatsInclude },
          orderBy: { startTimeUTC: "asc" },
        })
      }
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
        const playerTeam = stat.player?.teamAbbrev
        const playedAway = playerTeam === game.awayTeamAbbrev
        const playedHome = playerTeam === game.homeTeamAbbrev
        // Current team can be a club that was not in this game (trade, call-up). Do not assume they were home.
        const teamAbbrev = playedAway ? game.awayTeamAbbrev : playedHome ? game.homeTeamAbbrev : null
        const opponentAbbrev = playedHome ? game.awayTeamAbbrev : playedAway ? game.homeTeamAbbrev : null
        const homeRoadFlag = playedHome ? "H" : playedAway ? "R" : null
        logs.push({
          gameId: game.id,
          gameDate: game.gameDate,
          teamAbbrev,
          opponentAbbrev,
          homeRoadFlag,
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
