import { NextResponse } from "next/server"

export const runtime = "nodejs"

type NhlTeam = { abbrev?: string; score?: number | null; logo?: string }
type NhlGame = {
  id: number
  gameState?: string
  startTimeUTC?: string
  gameDate?: string | null
  awayTeam?: NhlTeam
  homeTeam?: NhlTeam
  periodDescriptor?: { number?: number }
  clock?: { timeRemaining?: string }
}
type PlayerGameLogRecord = Record<string, string | number | null>

export async function GET() {
  try {
    const res = await fetch("https://api-web.nhle.com/v1/schedule/now", {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      next: { revalidate: 60 }, // Cache on Vercel Edge for 60 seconds
    })

    if (!res.ok) {
      throw new Error(`NHL API error: ${res.status}`)
    }

    const data = await res.json()
    const todayDate = new Date()
    const monday = new Date(todayDate)
    monday.setDate(todayDate.getDate() - ((todayDate.getDay() + 6) % 7))
    const dates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + index)
      return date.toISOString().slice(0, 10)
    })
    const weekResponses = await Promise.all(dates.map(async (date) => {
      if (date === todayDate.toISOString().slice(0, 10)) return data
      const response = await fetch(`https://api-web.nhle.com/v1/schedule/${date}`, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } })
      return response.ok ? response.json() : null
    }))
    const week = weekResponses.flatMap((response) => {
      const days = (response?.gameWeek ?? []) as Array<{ date?: string; dayAbbrev?: string; games?: NhlGame[] }>
      return days.slice(0, 1)
    })
    const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
    const today = week.find((day) => day.date === currentDate) ?? week[0] ?? null
    const games = week.flatMap((day) => (day.games ?? []).map((game) => ({
      id: game.id,
      date: day.date ?? game.gameDate ?? null,
      day: day.dayAbbrev ?? null,
      gameState: game.gameState, // "FUT" (Pre-game), "LIVE", "FINAL"
      startTimeUTC: game.startTimeUTC,
      awayTeam: {
        abbrev: game.awayTeam?.abbrev ?? "NHL",
        score: game.awayTeam?.score ?? 0,
        logo: game.awayTeam?.logo,
      },
      homeTeam: {
        abbrev: game.homeTeam?.abbrev ?? "NHL",
        score: game.homeTeam?.score ?? 0,
        logo: game.homeTeam?.logo,
      },
      period: game.periodDescriptor?.number ?? null,
      clock: game.clock?.timeRemaining ?? null,
    })))
    const playerGameLogs: Record<string, PlayerGameLogRecord[]> = {}
    await Promise.all(games.filter((game) => game.gameState === "FINAL" || game.gameState === "OFF" || game.gameState === "LIVE").map(async (game) => {
      const response = await fetch(`https://api-web.nhle.com/v1/gamecenter/${game.id}/boxscore`, { headers: { Accept: "application/json" } })
      if (!response.ok) return
      const boxscore = await response.json() as {
        playerByGameStats?: {
          awayTeam?: { forwards?: PlayerGameLogRecord[]; defense?: PlayerGameLogRecord[]; goalies?: PlayerGameLogRecord[] }
          homeTeam?: { forwards?: PlayerGameLogRecord[]; defense?: PlayerGameLogRecord[]; goalies?: PlayerGameLogRecord[] }
        }
      }
      for (const side of [boxscore.playerByGameStats?.awayTeam, boxscore.playerByGameStats?.homeTeam]) {
        for (const group of [side?.forwards, side?.defense, side?.goalies]) {
          for (const player of group ?? []) {
            const playerId = String(player.playerId ?? "")
            if (!playerId) continue
            const existing = playerGameLogs[playerId] ?? []
            existing.push({
              gameId: game.id,
              gameDate: game.date,
              goals: Number(player.goals ?? 0),
              assists: Number(player.assists ?? 0),
              shots: Number(player.shots ?? 0),
              hits: Number(player.hits ?? 0),
              blocks: Number(player.blockedShots ?? 0),
              pim: Number(player.pim ?? 0),
              points: Number(player.points ?? 0),
              plusMinus: Number(player.plusMinus ?? 0),
              powerPlayPoints: Number(player.powerPlayPoints ?? 0),
              shorthandedGoals: Number(player.shorthandedGoals ?? 0),
              gameWinningGoals: Number(player.gameWinningGoals ?? 0),
              toi: String(player.timeOnIce ?? "—"),
              decision: player.decision ? String(player.decision) : null,
              shotsAgainst: Number(player.shotsAgainst ?? 0),
              goalsAgainst: Number(player.goalsAgainst ?? 0),
              savePctg: player.savePct ?? null,
              shutouts: Number(player.shutouts ?? 0),
              powerPlayToi: String(player.powerPlayTimeOnIce ?? player.powerPlayToi ?? "—"),
              penaltyKillToi: String(player.shorthandedTimeOnIce ?? player.shorthandedToi ?? "—"),
            })
            playerGameLogs[playerId] = existing
          }
        }
      }
    }))

    return NextResponse.json({
      date: today?.date,
      games: games.filter((game) => game.date === today?.date),
      weekGames: games,
      playerGameLogs,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: "Could not retrieve live NHL schedule", games: [] },
      { status: 500 }
    )
  }
}