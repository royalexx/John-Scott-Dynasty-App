import { PlayerStatus, Position, Prisma, SlotType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { calculateFantasyPoints } from "@/lib/scoring"

const NHL_HEADERS = { Accept: "application/json", "User-Agent": "JohnScottDynasty/1.0" }
const ACTIVE_STATES = ["LIVE", "CRIT", "FINAL", "OFF"]

type ScheduleGame = {
  id: number
  season?: number
  gameDate?: string
  startTimeUTC?: string
  gameState?: string
  periodDescriptor?: { number?: number }
  clock?: { timeRemaining?: string }
  awayTeam?: { abbrev?: string; score?: number | null }
  homeTeam?: { abbrev?: string; score?: number | null }
}

type BoxscorePlayer = Record<string, unknown> & {
  playerId?: number
  name?: string | { default?: string }
  firstName?: string | { default?: string }
  lastName?: string | { default?: string }
  position?: string
}

type BoxscoreSide = {
  forwards?: BoxscorePlayer[]
  defense?: BoxscorePlayer[]
  goalies?: BoxscorePlayer[]
}

type Boxscore = {
  playerByGameStats?: { awayTeam?: BoxscoreSide; homeTeam?: BoxscoreSide }
}

const numberValue = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0
const stringValue = (value: unknown, fallback: string) => typeof value === "string" ? value : fallback

function playerName(player: BoxscorePlayer): string {
  if (typeof player.name === "string" && player.name.trim()) {
    return player.name.trim()
  }
  if (
    typeof player.name === "object" &&
    player.name !== null &&
    "default" in player.name &&
    typeof player.name.default === "string"
  ) {
    const localizedName = player.name.default.trim()
    if (localizedName) return localizedName
  }
  const first = typeof player.firstName === "string" ? player.firstName : player.firstName?.default ?? ""
  const last = typeof player.lastName === "string" ? player.lastName : player.lastName?.default ?? ""
  const fullName = `${first} ${last}`.trim()
  if (fullName) return fullName
  return `NHL Player ${player.playerId ?? "Unknown"}`
}

function positionFor(player: BoxscorePlayer, goalie: boolean): Position {
  if (goalie) return Position.G
  return player.position === "D" ? Position.D : player.position === "LW" ? Position.LW : player.position === "RW" ? Position.RW : Position.C
}

async function getJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { headers: NHL_HEADERS })
  if (!response.ok) {
    console.error(`NHL request failed: ${response.status} ${url}`)
    return null
  }
  return response.json() as Promise<T>
}

export async function syncScheduleForDate(dateStr: string) {
  const data = await getJson<{ gameWeek?: Array<{ date?: string; games?: ScheduleGame[] }> }>(`https://api-web.nhle.com/v1/schedule/${dateStr}`)
  const games = data?.gameWeek?.flatMap((day) => day.games ?? []) ?? []
  let processedGames = 0

  for (const game of games) {
    if (!game.startTimeUTC || !game.homeTeam?.abbrev || !game.awayTeam?.abbrev) continue
    await prisma.nhlGame.upsert({
      where: { id: game.id },
      update: {
        season: game.season ?? Number(dateStr.slice(0, 4)),
        gameDate: game.gameDate ?? dateStr,
        startTimeUTC: new Date(game.startTimeUTC),
        homeTeamAbbrev: game.homeTeam.abbrev,
        awayTeamAbbrev: game.awayTeam.abbrev,
        gameState: game.gameState ?? "FUT",
        period: game.periodDescriptor?.number ?? null,
        clock: game.clock?.timeRemaining ?? null,
        homeScore: game.homeTeam.score ?? 0,
        awayScore: game.awayTeam.score ?? 0,
      },
      create: {
        id: game.id,
        season: game.season ?? Number(dateStr.slice(0, 4)),
        gameDate: game.gameDate ?? dateStr,
        startTimeUTC: new Date(game.startTimeUTC),
        homeTeamAbbrev: game.homeTeam.abbrev,
        awayTeamAbbrev: game.awayTeam.abbrev,
        gameState: game.gameState ?? "FUT",
        period: game.periodDescriptor?.number ?? null,
        clock: game.clock?.timeRemaining ?? null,
        homeScore: game.homeTeam.score ?? 0,
        awayScore: game.awayTeam.score ?? 0,
      },
    })
    processedGames += 1
  }
  return processedGames
}

async function syncPlayerStats(gameId: number, side: BoxscoreSide | undefined) {
  for (const [players, goalie] of [[side?.forwards, false], [side?.defense, false], [side?.goalies, true]] as const) {
    for (const player of players ?? []) {
      if (!player.playerId) continue
      const position = positionFor(player, goalie)
      const goals = numberValue(player.goals)
      const assists = numberValue(player.assists)
      const shots = numberValue(player.shots)
      const hits = numberValue(player.hits)
      const blocks = numberValue(player.blockedShots)
      const powerPlayPoints = numberValue(player.powerPlayPoints)
      const shorthandedGoals = numberValue(player.shorthandedGoals)
      const gameWinningGoals = numberValue(player.gameWinningGoals)
      const saves = numberValue(player.saves)
      const goalsAgainst = numberValue(player.goalsAgainst)
      const decision = typeof player.decision === "string" ? player.decision : null
      const stats = {
        goals, assists, shots, hits, blocks, powerPlayPoints, shorthandedGoals, gameWinningGoals,
        wins: decision === "W" ? 1 : 0,
        otLosses: decision === "OT" || decision === "OTL" ? 1 : 0,
        saves, goalsAgainst, shutouts: numberValue(player.shutouts),
      }
      const resolvedName = playerName(player)
      const nameUpdate = resolvedName.startsWith("NHL Player") ? {} : { name: resolvedName }
      await prisma.player.upsert({
        where: { id: player.playerId },
        update: { ...nameUpdate, position },
        create: {
          id: player.playerId,
          name: resolvedName,
          teamAbbrev: "FA",
          position,
          injuryStatus: PlayerStatus.HEALTHY,
        },
      })
      await prisma.playerGameStat.upsert({
        where: { playerId_gameId: { playerId: player.playerId, gameId } },
        update: {
          goals, assists, shots, hits, blocks,
          pim: numberValue(player.pim),
          plusMinus: numberValue(player.plusMinus),
          powerPlayPoints, shorthandedGoals, gameWinningGoals,
          toi: stringValue(player.toi ?? player.timeOnIce, "0:00"),
          shotsAgainst: numberValue(player.shotsAgainst),
          goalsAgainst, saves, shutouts: numberValue(player.shutouts),
          savePct: typeof player.savePct === "number" ? player.savePct : null,
          decision,
          fantasyPoints: calculateFantasyPoints(stats),
        },
        create: {
          playerId: player.playerId,
          gameId,
          goals, assists, shots, hits, blocks,
          pim: numberValue(player.pim),
          plusMinus: numberValue(player.plusMinus),
          powerPlayPoints, shorthandedGoals, gameWinningGoals,
          toi: stringValue(player.toi ?? player.timeOnIce, "0:00"),
          shotsAgainst: numberValue(player.shotsAgainst),
          goalsAgainst, saves, shutouts: numberValue(player.shutouts),
          savePct: typeof player.savePct === "number" ? player.savePct : null,
          decision,
          fantasyPoints: calculateFantasyPoints(stats),
        },
      })
    }
  }
}

export async function syncActiveGameBoxscores() {
  const games = await prisma.nhlGame.findMany({ where: { gameState: { in: ACTIVE_STATES } }, select: { id: true } })
  let processedGames = 0
  for (const game of games) {
    const boxscore = await getJson<Boxscore>(`https://api-web.nhle.com/v1/gamecenter/${game.id}/boxscore`)
    if (!boxscore?.playerByGameStats) continue
    await syncPlayerStats(game.id, boxscore.playerByGameStats.awayTeam)
    await syncPlayerStats(game.id, boxscore.playerByGameStats.homeTeam)
    processedGames += 1
  }
  return processedGames
}

function weekDates() {
  const now = new Date()
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setUTCDate(monday.getUTCDate() + index)
    return date.toISOString().slice(0, 10)
  })
}

export async function updateWeeklyMatchupScores(leagueId: string, week: number) {
  const matchups = await prisma.matchup.findMany({
    where: { leagueId, week },
    select: { id: true, season: true, homeTeamId: true, awayTeamId: true },
  })
  const gameDates = weekDates()
  for (const matchup of matchups) {
    const stats = await prisma.playerGameStat.findMany({
      where: {
        game: { season: matchup.season, gameDate: { in: gameDates } },
        player: { rosterSlots: { some: { teamId: { in: [matchup.homeTeamId, matchup.awayTeamId] }, slot: { notIn: [SlotType.BN, SlotType.TAXI, SlotType.IR, SlotType.IR_PLUS] } } } },
      },
      select: { fantasyPoints: true, playerId: true },
    })
    const roster = await prisma.rosterSlot.findMany({
      where: { teamId: { in: [matchup.homeTeamId, matchup.awayTeamId] }, slot: { notIn: [SlotType.BN, SlotType.TAXI, SlotType.IR, SlotType.IR_PLUS] } },
      select: { teamId: true, playerId: true },
    })
    const teamByPlayer = new Map(roster.map((slot) => [slot.playerId, slot.teamId]))
    const points = stats.reduce((totals, stat) => {
      const teamId = teamByPlayer.get(stat.playerId)
      if (teamId === matchup.homeTeamId) totals.home += stat.fantasyPoints
      if (teamId === matchup.awayTeamId) totals.away += stat.fantasyPoints
      return totals
    }, { home: 0, away: 0 })
    await prisma.matchup.update({
      where: { id: matchup.id },
      data: { homePoints: points.home, awayPoints: points.away, homeScore: points.home, awayScore: points.away, isFinal: false },
    })
  }
  return matchups.length
}

export async function enforceRosterLocks() {
  const startedGames = await prisma.nhlGame.findMany({
    where: { startTimeUTC: { lte: new Date() } },
    select: { homeTeamAbbrev: true, awayTeamAbbrev: true },
  })
  const teams = [...new Set(startedGames.flatMap((game) => [game.homeTeamAbbrev, game.awayTeamAbbrev]))]
  if (teams.length === 0) return 0
  const result = await prisma.rosterSlot.updateMany({
    where: { lockedAt: null, player: { teamAbbrev: { in: teams } } },
    data: { lockedAt: new Date() },
  })
  return result.count
}

export type SyncError = Prisma.PrismaClientKnownRequestError
