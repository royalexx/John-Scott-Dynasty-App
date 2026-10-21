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
const RECENT_FINAL_WINDOW_MS = 48 * 60 * 60 * 1000

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
  const writes = []

  for (const game of games) {
    if (!game.startTimeUTC || !game.homeTeam?.abbrev || !game.awayTeam?.abbrev) continue
    const record = {
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
    }
    writes.push(prisma.nhlGame.upsert({ where: { id: game.id }, update: record, create: { id: game.id, ...record } }))
  }
  if (writes.length === 0) return 0
  await prisma.$transaction(writes)
  return writes.length
}

type PlayerRow = { playerId: number; name: string; position: Position; teamAbbrev: string; stat: Prisma.PlayerGameStatCreateManyInput }

function parseSaveShotsAgainst(value: unknown): { saves: number; shotsAgainst: number } | null {
  if (typeof value !== "string") return null
  const [savesText, shotsText, extra] = value.split("/")
  if (shotsText == null || extra != null) return null
  const saves = Number(savesText.trim())
  const shotsAgainst = Number(shotsText.trim())
  if (!Number.isFinite(saves) || !Number.isFinite(shotsAgainst)) return null
  return { saves, shotsAgainst }
}

function collectSide(gameId: number, teamAbbrev: string, side: BoxscoreSide | undefined, scoring: LeagueScoring): PlayerRow[] {
  const playedGoalies = (side?.goalies ?? []).filter((goalie) => {
    const toi = stringValue(goalie.toi ?? goalie.timeOnIce, "0:00")
    return (toi !== "0:00" && toi !== "00:00" && toi !== "")
      || numberValue(goalie.saves) > 0
      || numberValue(goalie.shotsAgainst) > 0
      || Boolean(parseSaveShotsAgainst(goalie.saveShotsAgainst)?.shotsAgainst)
      || typeof goalie.decision === "string"
  }).length
  const rows: PlayerRow[] = []
  for (const [players, goalie] of [[side?.forwards, false], [side?.defense, false], [side?.goalies, true]] as const) {
    for (const player of players ?? []) {
      if (!player.playerId) continue
      const goals = numberValue(player.goals)
      const assists = numberValue(player.assists)
      const shots = numberValue(player.sog ?? player.shots)
      const hits = numberValue(player.hits)
      const blocks = numberValue(player.blockedShots)
      const powerPlayPoints = numberValue(player.powerPlayPoints)
      const shorthandedGoals = numberValue(player.shorthandedGoals)
      const gameWinningGoals = numberValue(player.gameWinningGoals)
      let saves = numberValue(player.saves)
      let shotsAgainst = numberValue(player.shotsAgainst)
      if (saves === 0 || shotsAgainst === 0) {
        const parsed = parseSaveShotsAgainst(player.saveShotsAgainst)
        if (parsed) {
          if (saves === 0) saves = parsed.saves
          if (shotsAgainst === 0) shotsAgainst = parsed.shotsAgainst
        }
      }
      const goalsAgainst = numberValue(player.goalsAgainst)
      const decision = typeof player.decision === "string" ? player.decision : null
      const plusMinus = numberValue(player.plusMinus)
      const shutouts = numberValue(player.shutouts) || (goalie && playedGoalies === 1 && decision === "W" && goalsAgainst === 0 && (saves > 0 || shotsAgainst > 0) ? 1 : 0)
      const savePct = typeof player.savePctg === "number" ? player.savePctg : typeof player.savePct === "number" ? player.savePct : shotsAgainst > 0 ? Number((saves / shotsAgainst).toFixed(4)) : null
      const pim = numberValue(player.pim)
      const toi = stringValue(player.toi ?? player.timeOnIce, "0:00")
      // Dressed backups (especially goalies) are listed with no time, no decision, and an empty line.
      if (
        (toi === "0:00" || toi === "00:00" || toi === "") &&
        !decision &&
        goals + assists + shots + hits + blocks + pim + Math.abs(plusMinus) + shotsAgainst + goalsAgainst + saves + shutouts === 0
      ) continue
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
          pim,
          plusMinus,
          powerPlayPoints, shorthandedGoals, gameWinningGoals,
          toi,
          shotsAgainst,
          goalsAgainst, saves, shutouts,
          savePct,
          decision,
          fantasyPoints,
        },
      })
    }
  }
  return rows
}

/** Stores one game's boxscore, then refreshes team abbreviations and games played for the players who appeared. */
async function syncGameStats(game: { id: number; homeTeamAbbrev: string; awayTeamAbbrev: string }, boxscore: NonNullable<Boxscore["playerByGameStats"]>, scoring: LeagueScoring) {
  const rows = [
    ...collectSide(game.id, game.awayTeamAbbrev, boxscore.awayTeam, scoring),
    ...collectSide(game.id, game.homeTeamAbbrev, boxscore.homeTeam, scoring),
  ]
  if (rows.length === 0) return
  const playerIds = [...new Set(rows.map((row) => row.playerId))]
  const known = await prisma.player.findMany({ where: { id: { in: playerIds } }, select: { id: true, teamAbbrev: true } })
  const knownTeams = new Map(known.map((player) => [player.id, player.teamAbbrev]))
  const missingById = new Map<number, PlayerRow>()
  for (const row of rows) {
    if (!knownTeams.has(row.playerId)) missingById.set(row.playerId, row)
  }
  if (missingById.size > 0) {
    await prisma.player.createMany({
      data: [...missingById.values()].map((row) => ({ id: row.playerId, name: row.name, teamAbbrev: row.teamAbbrev, position: row.position, injuryStatus: PlayerStatus.HEALTHY })),
      skipDuplicates: true,
    })
  }
  await prisma.$transaction([
    prisma.playerGameStat.deleteMany({ where: { gameId: game.id } }),
    prisma.playerGameStat.createMany({ data: rows.map((row) => row.stat), skipDuplicates: true }),
  ])

  const teamChanges = new Map<string, number[]>()
  for (const row of rows) {
    const stored = knownTeams.get(row.playerId)
    if (stored === undefined || stored === row.teamAbbrev) continue
    const ids = teamChanges.get(row.teamAbbrev) ?? []
    if (!ids.includes(row.playerId)) ids.push(row.playerId)
    teamChanges.set(row.teamAbbrev, ids)
  }
  if (teamChanges.size > 0) {
    await prisma.$transaction(
      [...teamChanges].map(([teamAbbrev, ids]) => prisma.player.updateMany({ where: { id: { in: ids } }, data: { teamAbbrev } })),
    )
  }

  await prisma.$executeRaw`
    UPDATE "Player" AS p
    SET "nhlGamesPlayed" = GREATEST(p."nhlGamesPlayed", a.cnt)
    FROM (
      SELECT s."playerId", COUNT(*)::int AS cnt
      FROM "PlayerGameStat" AS s
      INNER JOIN "NhlGame" AS g ON g.id = s."gameId"
      WHERE s."playerId" IN (${Prisma.join(playerIds)})
        AND g."gameState" IN ('FINAL', 'OFF')
        AND (s.toi NOT IN ('0:00', '00:00', '') OR s.decision IS NOT NULL OR s.shots > 0 OR s.saves > 0 OR s.goals > 0 OR s.assists > 0)
      GROUP BY s."playerId"
    ) a
    WHERE p.id = a."playerId"
  `
}

/**
 * Pulls boxscores for live games, games that finished in the last 48 hours, and older finished games
 * that have no stats yet or were stored with every shot total at 0 (boxscores synced before `sog` was read).
 * Recently finalized games are always included so a schedule sync that flips LIVE to FINAL cannot skip the final boxscore.
 * `limit` bounds how many of those older finished games are backfilled in one run.
 */
export async function syncActiveGameBoxscores(limit = 40) {
  const gameSelect = { id: true, homeTeamAbbrev: true, awayTeamAbbrev: true } as const
  const recentCutoff = new Date(Date.now() - RECENT_FINAL_WINDOW_MS)
  const [live, recentlyFinished, missing] = await Promise.all([
    prisma.nhlGame.findMany({ where: { gameState: { in: ["LIVE", "CRIT"] } }, select: gameSelect }),
    prisma.nhlGame.findMany({
      where: { gameState: { in: ["FINAL", "OFF"] }, startTimeUTC: { gte: recentCutoff } },
      select: gameSelect,
    }),
    prisma.nhlGame.findMany({
      where: { gameState: { in: ["FINAL", "OFF"] }, OR: [{ gameStats: { none: {} } }, { gameStats: { every: { shots: 0 } } }] },
      select: gameSelect,
      orderBy: { startTimeUTC: "asc" },
      take: limit,
    }),
  ])
  const seen = new Set<number>()
  const games = []
  for (const game of [...live, ...recentlyFinished, ...missing]) {
    if (seen.has(game.id)) continue
    seen.add(game.id)
    games.push(game)
  }
  const league = await prisma.league.findFirst({ select: { scoringSettings: true } })
  const scoring = (league?.scoringSettings ?? DEFAULT_LEAGUE_SCORING) as LeagueScoring
  const concurrency = 6
  let processedGames = 0
  for (let index = 0; index < games.length; index += concurrency) {
    const chunk = games.slice(index, index + concurrency)
    const fetched = await Promise.allSettled(chunk.map(async (game) => {
      const boxscore = await getJson<Boxscore>(`https://api-web.nhle.com/v1/gamecenter/${game.id}/boxscore`)
      if (!boxscore?.playerByGameStats) return false
      await syncGameStats(game, boxscore.playerByGameStats, scoring)
      return true
    }))
    for (const result of fetched) {
      if (result.status === "fulfilled") {
        if (result.value) processedGames += 1
        continue
      }
      console.error("NHL boxscore sync failed", result.reason)
    }
  }
  return processedGames
}

/** Syncs the NHL schedule for the given fantasy weeks (each schedule call returns that Monday-to-Sunday week). */
export async function syncScheduleForWeeks(season: number, weeks: number[]) {
  const counts = await Promise.all(weeks.map((week) => syncScheduleForDate(getFantasyWeekDates(week, season).startDate)))
  return counts.reduce((total, count) => total + count, 0)
}

/**
 * Scores a fantasy week from the NHL games played on the week's real calendar dates.
 * Past weeks, and the current week once it has started under weekly lock, are copied into
 * an immutable WeekLineup snapshot before scoring so later trades and lineup moves cannot rewrite them.
 * Marks the matchup final once the week is over and every NHL game in it has finished.
 */
export async function updateWeeklyMatchupScores(leagueId: string, week: number) {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { currentSeason: true, scoringSettings: true, lineupLockMode: true } })
  if (!league) return 0
  const matchups = await prisma.matchup.findMany({
    where: { leagueId, week, season: league.currentSeason },
    select: { id: true, homeTeamId: true, awayTeamId: true },
  })
  if (matchups.length === 0) return 0

  const { dates, endDate } = getFantasyWeekDates(week, league.currentSeason)
  const currentWeek = getCurrentFantasyWeek(league.currentSeason)
  if (week < currentWeek) {
    await freezeWeekLineup(prisma, leagueId, league.currentSeason, week)
  } else if (week === currentWeek) {
    const lock = await getLockSummary(league.currentSeason, league.lineupLockMode)
    if (lock.mode === "WEEKLY" && lock.weekStarted) await freezeWeekLineup(prisma, leagueId, league.currentSeason, week)
  }
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

/** Recomputes the live week, plus the previous week while any of its matchups are still open. */
export async function recomputeActiveMatchups(leagueId: string, currentWeek: number, includePreviousWeek = true) {
  const weeks = [currentWeek]
  const previousWeek = currentWeek - 1
  if (includePreviousWeek && previousWeek >= 1) {
    const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { currentSeason: true } })
    const stillOpen = league
      ? await prisma.matchup.findFirst({
          where: { leagueId, season: league.currentSeason, week: previousWeek, isFinal: false },
          select: { id: true },
        })
      : null
    if (stillOpen) weeks.unshift(previousWeek)
  }
  let updated = 0
  for (const week of weeks) updated += await updateWeeklyMatchupScores(leagueId, week)
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

const ESPN_INJURIES_URL = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries"

type EspnInjury = {
  athlete?: { displayName?: string }
  type?: unknown
  status?: unknown
  details?: unknown
  shortComment?: unknown
  longComment?: unknown
}

/** Same folding as scripts/sync-players.mjs: strip accents, then keep lowercase letters and digits. */
function normalizePlayerName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function localizedText(value: unknown) {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return null
  const record = value as { default?: unknown; abbreviation?: unknown; name?: unknown }
  if (typeof record.default === "string") return record.default
  if (typeof record.abbreviation === "string") return record.abbreviation
  if (typeof record.name === "string") return record.name
  return null
}

function espnInjuryStatus(value: unknown): PlayerStatus | null {
  const status = localizedText(value)?.toUpperCase()
  if (!status) return null
  if (status.includes("IR") || status.includes("INJURED")) return PlayerStatus.IR
  if (status.includes("DTD") || status.includes("DAY-TO-DAY") || status.includes("DAY TO DAY")) return PlayerStatus.DTD
  if (status === "O" || status.includes("OUT")) return PlayerStatus.O
  if (status.includes("HEALTHY") || status === "ACTIVE") return PlayerStatus.HEALTHY
  return null
}

/**
 * Refreshes Player.injuryStatus from the ESPN NHL injury report.
 * Players missing from a successful report are marked healthy. A failed or empty fetch leaves stored statuses alone.
 */
export async function syncEspnInjuries() {
  try {
    const response = await fetch(ESPN_INJURIES_URL, {
      headers: { Accept: "application/json", "User-Agent": "JohnScottDynasty/1.0" },
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`ESPN injury report failed: ${response.status}`)
    const data = await response.json() as { injuries?: Array<{ injuries?: EspnInjury[] }> }
    const byName = new Map<string, PlayerStatus>()
    for (const team of data.injuries ?? []) {
      for (const injury of team.injuries ?? []) {
        const name = injury.athlete?.displayName
        if (!name) continue
        const status = espnInjuryStatus(injury.type)
          ?? espnInjuryStatus(injury.status)
          ?? espnInjuryStatus([injury.details, injury.shortComment, injury.longComment].filter((part) => typeof part === "string").join(" "))
        if (!status || status === PlayerStatus.HEALTHY) continue
        byName.set(normalizePlayerName(name), status)
      }
    }
    if (byName.size === 0) {
      console.error("ESPN injury report contained no designations; leaving stored statuses unchanged")
      return 0
    }
    const players = await prisma.player.findMany({ select: { id: true, name: true, injuryStatus: true } })
    const changed = new Map<PlayerStatus, number[]>()
    for (const player of players) {
      const next = byName.get(normalizePlayerName(player.name)) ?? PlayerStatus.HEALTHY
      if (next === player.injuryStatus) continue
      const ids = changed.get(next) ?? []
      ids.push(player.id)
      changed.set(next, ids)
    }
    let updated = 0
    for (const [injuryStatus, ids] of changed) {
      const result = await prisma.player.updateMany({ where: { id: { in: ids } }, data: { injuryStatus } })
      updated += result.count
    }
    return updated
  } catch (error: unknown) {
    console.error("ESPN injury sync failed", error)
    return 0
  }
}
