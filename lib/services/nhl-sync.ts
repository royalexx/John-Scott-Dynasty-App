import { PlayerStatus, Position, Prisma, SlotType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { scoreGameStat, DEFAULT_LEAGUE_SCORING, type LeagueScoring } from "@/lib/scoring"
import { scoreTeams } from "@/lib/matchup-scoring"
import { isWeekFinal } from "@/lib/matchup-scoring"
import { getCurrentFantasyWeek, getEasternDate, getFantasyWeekDates } from "@/lib/season-calendar"
import { getLockSummary } from "@/lib/services/lineup-locks"
import { isStarterSlot } from "@/lib/lineup-lock"
import { freezeWeekLineup, scoringSlotsForWeek } from "@/lib/services/week-lineups"

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
  // NHL boxscores use single-letter codes (C/L/R/D/G); accept both styles.
  switch (player.position) {
    case "D": return Position.D
    case "L":
    case "LW": return Position.LW
    case "R":
    case "RW": return Position.RW
    default: return Position.C
  }
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
  // NHL returns each game under its day; the game object itself carries no date.
  const games = data?.gameWeek?.flatMap((day) => (day.games ?? []).map((game) => ({ ...game, gameDate: game.gameDate ?? day.date }))) ?? []
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

type PlayerRow = { playerId: number; name: string; position: Position; teamAbbrev: string; stat: Prisma.PlayerGameStatCreateManyInput }

function collectSide(gameId: number, teamAbbrev: string, side: BoxscoreSide | undefined, scoring: LeagueScoring): PlayerRow[] {
  const rows: PlayerRow[] = []
  for (const [players, goalie] of [[side?.forwards, false], [side?.defense, false], [side?.goalies, true]] as const) {
    for (const player of players ?? []) {
      if (!player.playerId) continue
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
      const plusMinus = numberValue(player.plusMinus)
      const shutouts = numberValue(player.shutouts)
      const fantasyPoints = scoreGameStat({ goals, assists, shots, hits, blocks, plusMinus, powerPlayPoints, shorthandedGoals, gameWinningGoals, saves, goalsAgainst, shutouts, decision }, scoring)
      rows.push({
        playerId: player.playerId,
        name: playerName(player),
        position: positionFor(player, goalie),
        teamAbbrev,
        stat: {
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
          fantasyPoints,
        },
      })
    }
  }
  return rows
}

/** Stores one game's boxscore in a handful of round trips (create unknown players, replace the game's stat lines). */
async function syncGameStats(game: { id: number; homeTeamAbbrev: string; awayTeamAbbrev: string }, boxscore: NonNullable<Boxscore["playerByGameStats"]>, scoring: LeagueScoring) {
  const rows = [
    ...collectSide(game.id, game.awayTeamAbbrev, boxscore.awayTeam, scoring),
    ...collectSide(game.id, game.homeTeamAbbrev, boxscore.homeTeam, scoring),
  ]
  if (rows.length === 0) return
  const known = new Set((await prisma.player.findMany({ where: { id: { in: rows.map((row) => row.playerId) } }, select: { id: true } })).map((p) => p.id))
  const missing = rows.filter((row) => !known.has(row.playerId))
  if (missing.length > 0) {
    await prisma.player.createMany({
      data: missing.map((row) => ({ id: row.playerId, name: row.name, teamAbbrev: row.teamAbbrev, position: row.position, injuryStatus: PlayerStatus.HEALTHY })),
      skipDuplicates: true,
    })
  }
  await prisma.$transaction([
    prisma.playerGameStat.deleteMany({ where: { gameId: game.id } }),
    prisma.playerGameStat.createMany({ data: rows.map((row) => row.stat), skipDuplicates: true }),
  ])
}

/**
 * Pulls boxscores for live games (every run) and for finished games that have no stats yet.
 * `limit` bounds how many finished-game backfills happen in one run.
 */
export async function syncActiveGameBoxscores(limit = 40) {
  const live = await prisma.nhlGame.findMany({ where: { gameState: { in: ["LIVE", "CRIT"] } }, select: { id: true, homeTeamAbbrev: true, awayTeamAbbrev: true } })
  const missing = await prisma.nhlGame.findMany({
    where: { gameState: { in: ["FINAL", "OFF"] }, gameStats: { none: {} } },
    select: { id: true, homeTeamAbbrev: true, awayTeamAbbrev: true },
    orderBy: { startTimeUTC: "asc" },
    take: limit,
  })
  const league = await prisma.league.findFirst({ select: { scoringSettings: true } })
  const scoring = (league?.scoringSettings ?? DEFAULT_LEAGUE_SCORING) as LeagueScoring
  let processedGames = 0
  for (const game of [...live, ...missing]) {
    const boxscore = await getJson<Boxscore>(`https://api-web.nhle.com/v1/gamecenter/${game.id}/boxscore`)
    if (!boxscore?.playerByGameStats) continue
    await syncGameStats(game, boxscore.playerByGameStats, scoring)
    processedGames += 1
  }
  return processedGames
}

/** Syncs the NHL schedule for the given fantasy weeks (each schedule call returns that Monday-to-Sunday week). */
export async function syncScheduleForWeeks(season: number, weeks: number[]) {
  let processed = 0
  for (const week of weeks) processed += await syncScheduleForDate(getFantasyWeekDates(week, season).startDate)
  return processed
}

/**
 * Scores a fantasy week from the NHL games played on the week's real calendar dates.
 * Uses the league scoring rules and each team's starting lineup; works for any past or current week (retroactive).
 * Marks the matchup final once the week is over and every NHL game in it has finished.
 */
export async function updateWeeklyMatchupScores(leagueId: string, week: number) {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { currentSeason: true, scoringSettings: true } })
  if (!league) return 0
  const matchups = await prisma.matchup.findMany({
    where: { leagueId, week, season: league.currentSeason },
    select: { id: true, homeTeamId: true, awayTeamId: true },
  })
  if (matchups.length === 0) return 0

  const { dates, endDate } = getFantasyWeekDates(week, league.currentSeason)
  const [games, slots] = await Promise.all([
    prisma.nhlGame.findMany({ where: { gameDate: { in: dates } }, select: { id: true, gameState: true } }),
    scoringSlotsForWeek(leagueId, league.currentSeason, week),
  ])
  const stats = await prisma.playerGameStat.findMany({
    where: { gameId: { in: games.map((game) => game.id) }, playerId: { in: slots.filter((slot) => isStarterSlot(slot.slot)).map((slot) => slot.playerId) } },
  })
  const totals = scoreTeams(slots, stats, league.scoringSettings as LeagueScoring | null)
  const final = isWeekFinal(endDate, getEasternDate(), games.map((game) => game.gameState))

  await prisma.$transaction(
    matchups.map((matchup) => {
      const home = totals.get(matchup.homeTeamId) ?? 0
      const away = totals.get(matchup.awayTeamId) ?? 0
      return prisma.matchup.update({
        where: { id: matchup.id },
        data: { homePoints: home, awayPoints: away, homeScore: home, awayScore: away, isFinal: final },
      })
    }),
  )
  return matchups.length
}

/** Recomputes every week from week 1 through the current week so history always matches the stats in the database. */
export async function recomputeMatchupsThroughWeek(leagueId: string, throughWeek: number) {
  let updated = 0
  for (let week = 1; week <= throughWeek; week += 1) updated += await updateWeeklyMatchupScores(leagueId, week)
  return updated
}

/** Keeps `League.currentWeek` aligned with the NHL calendar. */
export async function syncLeagueWeek(leagueId: string) {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { currentSeason: true, currentWeek: true } })
  if (!league) return null
  const week = getCurrentFantasyWeek(league.currentSeason)
  if (week !== league.currentWeek) await prisma.league.update({ where: { id: leagueId }, data: { currentWeek: week } })
  return week
}

/**
 * Persists lock timestamps so every view agrees with `getLockSummary`:
 * WEEKLY locks all starting slots from the first game of the week to Sunday night; DAILY locks players whose team's game started today.
 */
export async function enforceRosterLocks() {
  const leagues = await prisma.league.findMany({ select: { id: true, currentSeason: true, lineupLockMode: true } })
  let locked = 0
  for (const league of leagues) {
    const summary = await getLockSummary(league.currentSeason, league.lineupLockMode)
    const inLeague = { team: { leagueId: league.id } }
    if (summary.mode === "WEEKLY") {
      if (summary.weekStarted) await freezeWeekLineup(prisma, league.id, league.currentSeason, summary.week)
      const starters = [SlotType.C, SlotType.W, SlotType.F, SlotType.D, SlotType.G]
      await prisma.rosterSlot.updateMany({
        where: { ...inLeague, lockedAt: { not: null }, ...(summary.weekStarted ? { slot: { notIn: starters } } : {}) },
        data: { lockedAt: null },
      })
      if (summary.weekStarted) {
        const result = await prisma.rosterSlot.updateMany({ where: { ...inLeague, lockedAt: null, slot: { in: starters } }, data: { lockedAt: new Date() } })
        locked += result.count
      }
      continue
    }
    const teams = [...summary.startedTeams]
    await prisma.rosterSlot.updateMany({ where: { ...inLeague, lockedAt: { not: null }, player: { teamAbbrev: { notIn: teams } } }, data: { lockedAt: null } })
    if (teams.length === 0) continue
    const result = await prisma.rosterSlot.updateMany({ where: { ...inLeague, lockedAt: null, player: { teamAbbrev: { in: teams } } }, data: { lockedAt: new Date() } })
    locked += result.count
  }
  return locked
}
export type SyncError = Prisma.PrismaClientKnownRequestError

/** Re-prices every stored stat line with the league scoring rules (run after the commissioner edits scoring). */
export async function rescoreAllStats(scoring: LeagueScoring) {
  const s = { ...DEFAULT_LEAGUE_SCORING, ...scoring }
  const n = (value: number) => (Number.isFinite(value) ? value : 0)
  return prisma.$executeRaw`
    UPDATE "PlayerGameStat" SET "fantasyPoints" = ROUND((
      goals * ${n(s.goal)} + assists * ${n(s.assist)} + shots * ${n(s.shot)} + hits * ${n(s.hit)} + blocks * ${n(s.block)}
      + "powerPlayPoints" * ${n(s.ppp)} + "shorthandedGoals" * ${n(s.shg)} + "gameWinningGoals" * ${n(s.gwg)} + "plusMinus" * ${n(s.plusMinus)}
      + CASE WHEN decision = 'W' THEN ${n(s.win)} WHEN decision IN ('OT','OTL') THEN ${n(s.overtimeLoss)} ELSE 0 END
      + saves * ${n(s.save)} + "goalsAgainst" * ${n(s.goalsAgainst)} + shutouts * ${n(s.shutout)}
    )::numeric, 2)`
}
