import { NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"
import { prisma } from "@/lib/prisma"
import { calculateGoalieFPTS, calculateSkaterFPTS, type PlayerGameLog } from "@/lib/hockey-data"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function normalizePlayer(player: Record<string, unknown>) {
  const position = player.position === "LW" || player.position === "RW" || player.position === "D" || player.position === "G" || player.position === "C"
    ? player.position
    : "C"
  const goalie = position === "G"
  const unplayedGoalie = goalie && !player.gp && !player.saves
  const injuryStatus = player.injuryStatus === "IR" || player.injuryStatus === "DTD" || player.injuryStatus === "O"
    ? player.injuryStatus
    : null
  return {
    rank: 0,
    name: String(player.name ?? "Unknown Player"),
    position,
    team: String(player.team ?? "NHL"),
    waiver: String(player.waiver ?? "FA"),
    velocity: "0",
    rostered: "0%",
    trend: "steady",
    fpts: Number(player.fpts ?? player.projPts ?? 0),
    projection: Number(player.projection ?? player.projPts ?? 0),
    gp: unplayedGoalie ? Number(player.gp ?? 0) : Math.max(1, Number(player.gp ?? 82)),
    goals: Number(player.goals ?? 0),
    assists: Number(player.assists ?? 0),
    sog: Number(player.sog ?? 0),
    hits: Number(player.hits ?? 0),
    blocks: Number(player.blocks ?? 0),
    adp: Number(player.adp ?? 999),
    ...(goalie ? {
      wins: Number(player.wins ?? 0),
      saves: Number(player.saves ?? 0),
      shutouts: Number(player.shutouts ?? 0),
      savePct: Number(player.savePct ?? (unplayedGoalie ? 0 : 0.915)),
    } : {}),
    nhlId: Number(player.nhlId),
    headshot: String(player.headshot ?? `https://assets.nhle.com/mugs/nhl/latest/${player.nhlId}.png`),
    id: String(player.id ?? `nhl-${player.nhlId}`),
    slot: player.slot,
    projPts: Number(player.projPts ?? 0),
    todayPts: player.todayPts ?? null,
    opponent: String(player.opponent ?? "—"),
    profile: player.profile,
    currentSeasonStats: player.currentSeasonStats,
    gameLog: player.gameLog,
    historicalSeasons: player.historicalSeasons,
    nhlGamesPlayed: typeof player.nhlGamesPlayed === "number" ? player.nhlGamesPlayed : undefined,
    injuryStatus,
    injuryVerification: player.injuryVerification,
    injurySources: player.injurySources,
  }
}

type RegistryPlayer = ReturnType<typeof normalizePlayer>
type Position = RegistryPlayer["position"]
type InjuryStatus = NonNullable<RegistryPlayer["injuryStatus"]>

type DatabasePlayer = {
  id: number
  name: string
  teamAbbrev: string
  position: string
  injuryStatus: string
  nhlGamesPlayed: number
}

type LiveStat = {
  playerId: number
  goals: number
  assists: number
  shots: number
  hits: number
  blocks: number
  pim: number
  plusMinus: number
  powerPlayPoints: number
  shorthandedGoals: number
  gameWinningGoals: number
  toi: string
  decision: string | null
  shotsAgainst: number
  goalsAgainst: number
  saves: number
  savePct: number | null
  shutouts: number
  fantasyPoints: number
  gameId: number
  season: number
  gameDate: string
  homeTeamAbbrev: string
  awayTeamAbbrev: string
}

type MergedGame = PlayerGameLog & { saves: number; fantasyPoints?: number }

let cachedPlayers: { mtimeMs: number; payload: RegistryPlayer[] } | null = null

function finite(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

function isPosition(value: string): value is Position {
  return value === "C" || value === "LW" || value === "RW" || value === "D" || value === "G"
}

function listedInjury(value: string): InjuryStatus | null {
  return value === "IR" || value === "DTD" || value === "O" ? value : null
}

function playerNhlId(player: { id: string; nhlId: number }): number | null {
  if (Number.isFinite(player.nhlId) && player.nhlId > 0) return player.nhlId
  const match = /^nhl-(\d+)$/.exec(player.id)
  return match ? Number(match[1]) : null
}

function readSeason(stats: unknown): number | undefined {
  if (typeof stats !== "object" || stats === null || !("season" in stats)) return undefined
  const season = (stats as { season: unknown }).season
  return typeof season === "number" && Number.isFinite(season) ? season : undefined
}

function readCachedPlayers(): RegistryPlayer[] | null {
  const filePath = path.join(process.cwd(), "public", "data", "nhl-players.json")
  if (!fs.existsSync(filePath)) return null
  const stat = fs.statSync(filePath)
  if (!cachedPlayers || cachedPlayers.mtimeMs !== stat.mtimeMs) {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>[]
    cachedPlayers = { mtimeMs: stat.mtimeMs, payload: data.map(normalizePlayer) }
  }
  return cachedPlayers.payload
}

async function readSearchFallback(): Promise<RegistryPlayer[] | null> {
  try {
    const res = await fetch(
      "https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=5000&q=*&active=true",
      { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } }
    )
    const data = await res.json()
    return (data ?? []).map((p: Record<string, unknown>) => normalizePlayer({
      id: `nhl-${p.playerId}`,
      nhlId: Number(p.playerId),
      name: p.name,
      team: p.teamAbbrev || p.lastTeamAbbrev || "NHL",
      position: p.positionCode === "L" ? "LW" : p.positionCode === "R" ? "RW" : p.positionCode || "C",
      slot: p.positionCode === "D" ? "D" : p.positionCode === "G" ? "G" : "W",
      projPts: 10.0,
      todayPts: null,
      waiver: "FA",
      opponent: "—",
      headshot: `https://assets.nhle.com/mugs/nhl/latest/${p.playerId}.png`,
    }))
  } catch (error) {
    console.error("Failed to load NHL player search fallback", error)
    return null
  }
}

function staticGameLogs(value: unknown): MergedGame[] {
  if (!Array.isArray(value)) return []
  const logs: MergedGame[] = []
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue
    const game = entry as Record<string, unknown>
    const gameId = finite(game.gameId)
    const gameDate = typeof game.gameDate === "string" ? game.gameDate : ""
    if (!gameId || !gameDate) continue
    const goals = finite(game.goals)
    const assists = finite(game.assists)
    const shotsAgainst = finite(game.shotsAgainst)
    const goalsAgainst = finite(game.goalsAgainst)
    const shots = finite(game.shots)
    const hits = finite(game.hits)
    const blocks = finite(game.blocks)
    const powerPlayPoints = finite(game.powerPlayPoints)
    const shorthandedGoals = finite(game.shorthandedGoals)
    const gameWinningGoals = finite(game.gameWinningGoals)
    const shutouts = finite(game.shutouts)
    const saves = typeof game.saves === "number" && Number.isFinite(game.saves) ? game.saves : shotsAgainst - goalsAgainst
    logs.push({
      gameId,
      gameDate,
      teamAbbrev: typeof game.teamAbbrev === "string" ? game.teamAbbrev : undefined,
      opponentAbbrev: typeof game.opponentAbbrev === "string" ? game.opponentAbbrev : undefined,
      homeRoadFlag: game.homeRoadFlag === "H" || game.homeRoadFlag === "R" ? game.homeRoadFlag : undefined,
      goals,
      assists,
      points: goals + assists,
      shots,
      hits,
      blocks,
      pim: finite(game.pim),
      plusMinus: finite(game.plusMinus),
      powerPlayPoints,
      shorthandedGoals,
      gameWinningGoals,
      toi: typeof game.toi === "string" ? game.toi : "0:00",
      decision: typeof game.decision === "string" ? game.decision : null,
      shotsAgainst,
      goalsAgainst,
      saves,
      savePctg: typeof game.savePctg === "number" && Number.isFinite(game.savePctg) ? game.savePctg : null,
      shutouts,
      powerPlayToi: typeof game.powerPlayToi === "string" ? game.powerPlayToi : undefined,
      penaltyKillToi: typeof game.penaltyKillToi === "string" ? game.penaltyKillToi : undefined,
      fantasyPoints: typeof game.fantasyPoints === "number" && Number.isFinite(game.fantasyPoints) ? game.fantasyPoints : undefined,
    })
  }
  return logs
}

/** Boxscores list dressed goalies who never entered the game as 00:00 with an empty line. */
function playedStat(stat: LiveStat): boolean {
  const toi = stat.toi.trim()
  const noTime = toi === "" || toi === "0:00" || toi === "00:00" || toi === "0:00:00"
  if (!noTime || stat.decision) return true
  return stat.goals + stat.assists + stat.shots + stat.hits + stat.blocks + stat.pim + Math.abs(stat.plusMinus)
    + stat.shotsAgainst + stat.goalsAgainst + stat.saves + stat.shutouts + stat.powerPlayPoints
    + stat.shorthandedGoals + stat.gameWinningGoals > 0
}

function liveGameLog(stat: LiveStat, team: string): MergedGame {
  const home = stat.homeTeamAbbrev === team
  return {
    gameId: stat.gameId,
    gameDate: stat.gameDate,
    teamAbbrev: team,
    opponentAbbrev: home ? stat.awayTeamAbbrev : stat.homeTeamAbbrev,
    homeRoadFlag: home ? "H" : "R",
    goals: stat.goals,
    assists: stat.assists,
    points: stat.goals + stat.assists,
    shots: stat.shots,
    hits: stat.hits,
    blocks: stat.blocks,
    pim: stat.pim,
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
  }
}

function mergeGameLogs(dbLogs: LiveStat[], staticLogs: MergedGame[], team: string): MergedGame[] {
  const staticById = new Map(staticLogs.map((game) => [game.gameId, game]))
  const live = dbLogs.filter(playedStat).map((stat) => {
    const row = liveGameLog(stat, team)
    const prior = staticById.get(stat.gameId)
    if (!prior) return row
    // The boxscore sync stored shots/special-teams as 0 (`sog` was unread). Keep the static count until a non-zero live value exists.
    return {
      ...row,
      shots: row.shots || prior.shots,
      powerPlayPoints: row.powerPlayPoints || prior.powerPlayPoints,
      shorthandedGoals: row.shorthandedGoals || prior.shorthandedGoals,
      gameWinningGoals: row.gameWinningGoals || prior.gameWinningGoals,
      powerPlayToi: prior.powerPlayToi,
      penaltyKillToi: prior.penaltyKillToi,
    }
  })
  const seen = new Set(live.map((game) => game.gameId))
  const older = staticLogs.filter((game) => !seen.has(game.gameId))
  return [...live, ...older].sort((a, b) => b.gameDate.localeCompare(a.gameDate))
}

function sumGameLog(games: MergedGame[], position: Position, season: number | undefined, player: { projPts?: number } = {}) {
  const sum = (read: (game: MergedGame) => number) => games.reduce((total, game) => total + read(game), 0)
  const goals = sum((game) => game.goals)
  const assists = sum((game) => game.assists)
  const shots = sum((game) => game.shots)
  const hits = sum((game) => game.hits)
  const blocks = sum((game) => game.blocks)
  const powerPlayPoints = sum((game) => game.powerPlayPoints)
  const shorthandedGoals = sum((game) => game.shorthandedGoals)
  const gameWinningGoals = sum((game) => game.gameWinningGoals)
  const shotsAgainst = sum((game) => game.shotsAgainst)
  const goalsAgainst = sum((game) => game.goalsAgainst)
  const shutouts = sum((game) => game.shutouts)
  const saves = sum((game) => game.saves)
  const wins = games.reduce((total, game) => total + (game.decision === "W" ? 1 : 0), 0)
  const gp = games.length
  const savePct = shotsAgainst > 0 ? Number((saves / shotsAgainst).toFixed(3)) : 0
  const loggedFantasyPoints = games.every((game) => typeof game.fantasyPoints === "number" && Number.isFinite(game.fantasyPoints))
    ? Number(games.reduce((total, game) => total + Number(game.fantasyPoints), 0).toFixed(1))
    : undefined
  const fpts = loggedFantasyPoints ?? (position === "G"
    ? calculateGoalieFPTS({ gp, wins, saves, goalsAgainst, shutouts, savePct })
    : calculateSkaterFPTS({ gp, goals, assists, sog: shots, hits, blocks, ppp: powerPlayPoints, shg: shorthandedGoals, gwg: gameWinningGoals }))
  const currentSeasonStats: Record<string, number> = {
    gamesPlayed: gp,
    goals,
    assists,
    points: goals + assists,
    shots,
    hits,
    blocks,
    powerPlayPoints,
    shorthandedGoals,
    gameWinningGoals,
    pim: sum((game) => game.pim),
    plusMinus: sum((game) => game.plusMinus),
    wins,
    saves,
    goalsAgainst,
    shutouts,
    savePct,
  }
  if (season != null) currentSeasonStats.season = season
  const perGame = gp > 0 ? fpts / gp : (player.projPts || 3.2) / 3.5
  const weeklyProjection = Number((perGame * 3.5).toFixed(1))
  return { gp, goals, assists, sog: shots, hits, blocks, wins, saves, shutouts, savePct, fpts, currentSeasonStats, projPts: weeklyProjection, projection: weeklyProjection }
}

function registryPlayerFromDatabase(dbPlayer: DatabasePlayer): RegistryPlayer {
  const position = isPosition(dbPlayer.position) ? dbPlayer.position : "C"
  return normalizePlayer({
    id: `nhl-${dbPlayer.id}`,
    nhlId: dbPlayer.id,
    name: dbPlayer.name,
    team: dbPlayer.teamAbbrev,
    position,
    slot: position === "LW" || position === "RW" ? "W" : position,
    waiver: "FA",
    opponent: "—",
    projPts: 0,
    fpts: 0,
    gp: dbPlayer.nhlGamesPlayed,
    headshot: `https://assets.nhle.com/mugs/nhl/latest/${dbPlayer.id}.png`,
    injuryStatus: listedInjury(dbPlayer.injuryStatus),
    nhlGamesPlayed: dbPlayer.nhlGamesPlayed,
  })
}

function applyLiveStats(player: RegistryPlayer, dbPlayer: DatabasePlayer | undefined, dbLogs: LiveStat[]): RegistryPlayer {
  const team = dbPlayer && dbPlayer.teamAbbrev && dbPlayer.teamAbbrev !== "FA" && dbPlayer.teamAbbrev !== "NHL"
    ? dbPlayer.teamAbbrev
    : player.team
  const position = dbPlayer && isPosition(dbPlayer.position) ? dbPlayer.position : player.position
  const playedLogs = dbLogs.filter(playedStat)
  const nhlGamesPlayed = dbPlayer
    ? Math.max(player.nhlGamesPlayed ?? 0, dbPlayer.nhlGamesPlayed ?? 0, playedLogs.length)
    : player.nhlGamesPlayed
  const injuryStatus = dbPlayer
    ? dbPlayer.injuryStatus === "HEALTHY" ? player.injuryStatus : (listedInjury(dbPlayer.injuryStatus) ?? player.injuryStatus)
    : player.injuryStatus
  const gameLog = mergeGameLogs(dbLogs, staticGameLogs(player.gameLog), team)
  if (gameLog.length === 0) {
    return { ...player, team, position, nhlGamesPlayed, injuryStatus }
  }
  const season = dbLogs.reduce((latest, stat) => Math.max(latest, stat.season), 0) || readSeason(player.currentSeasonStats)
  return {
    ...player,
    team,
    position,
    nhlGamesPlayed,
    injuryStatus,
    gameLog,
    ...sumGameLog(gameLog, position, season, player),
  }
}

function overlayLiveStats(basePlayers: RegistryPlayer[], dbPlayers: DatabasePlayer[], gameStats: LiveStat[]): RegistryPlayer[] {
  const logsByPlayerId = new Map<number, LiveStat[]>()
  for (const stat of gameStats) {
    const rows = logsByPlayerId.get(stat.playerId)
    if (rows) rows.push(stat)
    else logsByPlayerId.set(stat.playerId, [stat])
  }
  const dbById = new Map(dbPlayers.map((player) => [player.id, player]))
  const seen = new Set<number>()
  const overlaid = basePlayers.map((player) => {
    const nhlId = playerNhlId(player)
    const dbPlayer = nhlId == null ? undefined : dbById.get(nhlId)
    if (nhlId != null) seen.add(nhlId)
    return applyLiveStats(player, dbPlayer, nhlId == null ? [] : logsByPlayerId.get(nhlId) ?? [])
  })
  const extras = dbPlayers
    .filter((player) => !seen.has(player.id))
    .map((player) => applyLiveStats(registryPlayerFromDatabase(player), player, logsByPlayerId.get(player.id) ?? []))
  return [...overlaid, ...extras]
}

export async function GET() {
  const basePlayers = readCachedPlayers() ?? await readSearchFallback()
  if (!basePlayers) {
    return NextResponse.json({ error: "Failed to load players" }, { status: 500 })
  }

  let dbPlayers: DatabasePlayer[] = []
  let gameStats: LiveStat[] = []
  try {
    const [players, stats] = await Promise.all([
      prisma.player.findMany({ select: { id: true, name: true, teamAbbrev: true, position: true, injuryStatus: true, nhlGamesPlayed: true } }),
      prisma.playerGameStat.findMany({
        where: { game: { gameState: { in: ["LIVE", "CRIT", "FINAL", "OFF"] } } },
        include: { game: { select: { id: true, season: true, gameDate: true, homeTeamAbbrev: true, awayTeamAbbrev: true, startTimeUTC: true } } },
        orderBy: { game: { gameDate: "desc" } },
      }),
    ])
    dbPlayers = players
    gameStats = stats.map((stat) => ({
      playerId: stat.playerId,
      goals: stat.goals,
      assists: stat.assists,
      shots: stat.shots,
      hits: stat.hits,
      blocks: stat.blocks,
      pim: stat.pim,
      plusMinus: stat.plusMinus,
      powerPlayPoints: stat.powerPlayPoints,
      shorthandedGoals: stat.shorthandedGoals,
      gameWinningGoals: stat.gameWinningGoals,
      toi: stat.toi,
      decision: stat.decision,
      shotsAgainst: stat.shotsAgainst,
      goalsAgainst: stat.goalsAgainst,
      saves: stat.saves,
      savePct: stat.savePct,
      shutouts: stat.shutouts,
      fantasyPoints: stat.fantasyPoints,
      gameId: stat.game.id,
      season: stat.game.season,
      gameDate: stat.game.gameDate,
      homeTeamAbbrev: stat.game.homeTeamAbbrev,
      awayTeamAbbrev: stat.game.awayTeamAbbrev,
    }))
  } catch (error) {
    console.error("Failed to read live player stats", error)
  }

  return NextResponse.json(overlayLiveStats(basePlayers, dbPlayers, gameStats), {
    headers: { "Cache-Control": "no-store" },
  })
}
