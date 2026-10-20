import {
  calculateGoalieFPTS,
  calculateSkaterFPTS,
  type GoalieStats,
  type MarketPlayer,
  type Player,
  type PlayerGameLog,
  type SkaterStats,
} from "@/lib/hockey-data"
import { DEFAULT_LEAGUE_SCORING, scoreGameStat } from "@/lib/scoring"
import { getEasternDate } from "@/lib/season-calendar"

export type LeaderCategory = "FPTS" | "G" | "A" | "SOG" | "HIT" | "BLK" | "W" | "SV" | "SV%" | "SO"
export type LeaderMode = "total" | "per_game"
export type SearchPlayer = (Player | MarketPlayer) & { id: string; owner: string }

export const normalizeSearchText = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

export function getSyncedPlayerStats(player: MarketPlayer): SkaterStats | GoalieStats {
  const current = player.currentSeasonStats
  if (player.position === "G") {
    return {
      gp: current?.gamesPlayed ?? player.gp,
      wins: current?.wins ?? player.wins ?? 0,
      otLosses: current?.otLosses ?? 0,
      saves: current?.saves ?? player.saves ?? 0,
      goalsAgainst: current?.goalsAgainst ?? 0,
      shutouts: current?.shutouts ?? player.shutouts ?? 0,
      savePct: current?.savePct ?? player.savePct ?? 0,
      goals: current?.goals ?? player.goals,
      assists: current?.assists ?? player.assists,
      sog: current?.shots ?? player.sog,
      hits: current?.hits ?? player.hits,
      blocks: current?.blocks ?? player.blocks,
      ppp: current?.powerPlayPoints ?? 0,
      shg: current?.shorthandedGoals ?? 0,
      gwg: current?.gameWinningGoals ?? 0,
      plusMinus: current?.plusMinus ?? 0,
    }
  }
  return {
    gp: current?.gamesPlayed ?? player.gp,
    goals: current?.goals ?? player.goals,
    assists: current?.assists ?? player.assists,
    sog: current?.shots ?? player.sog,
    hits: current?.hits ?? player.hits,
    blocks: current?.blocks ?? player.blocks,
    ppp: current?.powerPlayPoints ?? 0,
    shg: current?.shorthandedGoals ?? 0,
    gwg: current?.gameWinningGoals ?? 0,
    plusMinus: current?.plusMinus ?? 0,
  }
}

const ROLLING_DAY_WINDOWS: Record<string, number> = {
  "Last 7 Days": 7,
  "Last 14 Days": 14,
  "Last 30 Days": 30,
}

function calendarDay(value: string): string {
  return value.slice(0, 10)
}

function daysBefore(later: string, earlier: string): number {
  const end = Date.parse(`${calendarDay(later)}T00:00:00Z`)
  const start = Date.parse(`${calendarDay(earlier)}T00:00:00Z`)
  return Math.round((end - start) / 86_400_000)
}

function horizonGames(player: MarketPlayer, horizon?: string, referenceDate?: string): PlayerGameLog[] | null {
  const days = horizon ? ROLLING_DAY_WINDOWS[horizon] : undefined
  if (!days || !Array.isArray(player.gameLog)) return null
  const anchor = referenceDate ? calendarDay(referenceDate) : getEasternDate()
  return player.gameLog.filter((game) => {
    if (!game.gameDate) return false
    const age = daysBefore(anchor, game.gameDate)
    return Number.isFinite(age) && age >= 0 && age <= days
  })
}

function pointsForLoggedGame(game: PlayerGameLog): number {
  if (typeof game.fantasyPoints === "number" && Number.isFinite(game.fantasyPoints)) return game.fantasyPoints
  const saves = typeof game.saves === "number" && Number.isFinite(game.saves)
    ? game.saves
    : Math.max(0, (game.shotsAgainst ?? 0) - (game.goalsAgainst ?? 0))
  return scoreGameStat({
    goals: Number(game.goals) || 0,
    assists: Number(game.assists) || 0,
    shots: Number(game.shots) || 0,
    hits: Number(game.hits) || 0,
    blocks: Number(game.blocks) || 0,
    plusMinus: Number(game.plusMinus) || 0,
    powerPlayPoints: Number(game.powerPlayPoints) || 0,
    shorthandedGoals: Number(game.shorthandedGoals) || 0,
    gameWinningGoals: Number(game.gameWinningGoals) || 0,
    saves,
    goalsAgainst: Number(game.goalsAgainst) || 0,
    shutouts: Number(game.shutouts) || 0,
    decision: game.decision,
  }, DEFAULT_LEAGUE_SCORING)
}

function statsFpts(player: MarketPlayer, stats: SkaterStats | GoalieStats): number {
  return player.position === "G" ? calculateGoalieFPTS(stats as GoalieStats) : calculateSkaterFPTS(stats as SkaterStats)
}

/** Season game-log points, when the log is the season the counting line describes. */
function seasonLogPoints(player: MarketPlayer): number | undefined {
  if (!Array.isArray(player.gameLog) || player.gameLog.length === 0) return undefined
  const officialGp = player.currentSeasonStats?.gamesPlayed
  if (typeof officialGp === "number" && officialGp > 0 && officialGp !== player.gameLog.length) return undefined
  return player.gameLog.reduce((total, game) => total + pointsForLoggedGame(game), 0)
}

/** Season totals, unless `horizon` is Last 7/14/30 Days and `player.gameLog` is an array. */
export function getPlayerStatsForHorizon(player: MarketPlayer, horizon?: string, referenceDate?: string): SkaterStats | GoalieStats {
  const games = horizonGames(player, horizon, referenceDate)
  if (!games) return getSyncedPlayerStats(player)
  const sum = (read: (game: PlayerGameLog) => number) => games.reduce((total, game) => total + (Number(read(game)) || 0), 0)

  if (player.position === "G") {
    const shotsAgainst = sum((game) => game.shotsAgainst)
    const saves = sum((game) => {
      const recorded = game.saves
      return typeof recorded === "number" && Number.isFinite(recorded) && recorded > 0
        ? recorded
        : Math.max(0, (game.shotsAgainst ?? 0) - (game.goalsAgainst ?? 0))
    })
    return {
      gp: games.length,
      wins: games.reduce((total, game) => total + (game.decision === "W" ? 1 : 0), 0),
      otLosses: games.reduce((total, game) => total + (game.decision === "OT" || game.decision === "OTL" ? 1 : 0), 0),
      saves,
      goalsAgainst: sum((game) => game.goalsAgainst),
      shutouts: sum((game) => game.shutouts),
      savePct: shotsAgainst > 0 ? saves / shotsAgainst : 0,
      goals: sum((game) => game.goals),
      assists: sum((game) => game.assists),
      sog: sum((game) => game.shots),
      hits: sum((game) => game.hits),
      blocks: sum((game) => game.blocks),
      ppp: sum((game) => game.powerPlayPoints),
      shg: sum((game) => game.shorthandedGoals),
      gwg: sum((game) => game.gameWinningGoals),
      plusMinus: sum((game) => game.plusMinus),
    }
  }

  return {
    gp: games.length,
    goals: sum((game) => game.goals),
    assists: sum((game) => game.assists),
    sog: sum((game) => game.shots),
    hits: sum((game) => game.hits),
    blocks: sum((game) => game.blocks),
    ppp: sum((game) => game.powerPlayPoints),
    shg: sum((game) => game.shorthandedGoals),
    gwg: sum((game) => game.gameWinningGoals),
    plusMinus: sum((game) => game.plusMinus),
  }
}

export function getSyncedPlayerFPTS(player: MarketPlayer, horizon?: string, referenceDate?: string): number {
  const window = horizonGames(player, horizon, referenceDate)
  const stats = getPlayerStatsForHorizon(player, horizon, referenceDate)
  const total = window
    ? window.reduce((sum, game) => sum + pointsForLoggedGame(game), 0)
    : seasonLogPoints(player) ?? statsFpts(player, stats)
  if (horizon === "Season Avg / Per Game") return Number((total / Math.max(1, stats.gp)).toFixed(1))
  return Number(total.toFixed(1))
}

export function getLeaderStat(
  player: SearchPlayer,
  category: LeaderCategory,
  mode: LeaderMode,
  projectionGames?: number,
  horizon?: string,
  referenceDate?: string,
): { numeric: number; display: string } {
  const marketPlayer = player as MarketPlayer
  const usesLoggedStats = "position" in player && ("currentSeasonStats" in player || Array.isArray(marketPlayer.gameLog))
  const source = usesLoggedStats
    ? getPlayerStatsForHorizon(marketPlayer, horizon, referenceDate)
    : "stats" in player && player.stats ? player.stats : player
  const rawGp = Number("gp" in source ? source.gp : "gamesPlayed" in player ? player.gamesPlayed : "gp" in player ? player.gp : 20)
  const gp = Number.isFinite(rawGp) ? Math.max(1, rawGp) : 1
  const stats = source as unknown as Record<string, number | undefined>
  if (category === "SV%") {
    if (rawGp <= 0 || (Number(stats.saves ?? 0) <= 0 && Number(stats.gp ?? 0) <= 0)) {
      return { numeric: 0, display: "0.000" }
    }
    const savePct = stats.savePct ?? ("savePct" in player ? player.savePct : 0.915) ?? 0.915
    return { numeric: savePct, display: savePct.toFixed(3) }
  }

  const calculatedFpts = usesLoggedStats
    ? getSyncedPlayerFPTS(marketPlayer, horizon === "Season Avg / Per Game" ? undefined : horizon, referenceDate)
    : player.position === "G"
    ? calculateGoalieFPTS({
        gp,
        wins: Number(stats.wins ?? ("wins" in player ? player.wins : 0)) || 0,
        otLosses: Number(stats.otLosses ?? 0) || 0,
        saves: Number(stats.saves ?? ("saves" in player ? player.saves : 0)) || 0,
        goalsAgainst: Number(stats.goalsAgainst ?? 0) || 0,
        shutouts: Number(stats.shutouts ?? ("shutouts" in player ? player.shutouts : 0)) || 0,
        savePct: Number(stats.savePct ?? ("savePct" in player ? player.savePct : 0.915)) || 0.915,
        goals: Number(stats.goals ?? ("goals" in player ? player.goals : 0)) || 0,
        assists: Number(stats.assists ?? ("assists" in player ? player.assists : 0)) || 0,
        sog: Number(stats.sog ?? ("sog" in player ? player.sog : 0)) || 0,
        hits: Number(stats.hits ?? ("hits" in player ? player.hits : 0)) || 0,
        blocks: Number(stats.blocks ?? ("blocks" in player ? player.blocks : 0)) || 0,
        ppp: Number(stats.ppp ?? 0) || 0,
        shg: Number(stats.shg ?? 0) || 0,
        gwg: Number(stats.gwg ?? 0) || 0,
        plusMinus: Number(stats.plusMinus ?? 0) || 0,
      })
    : calculateSkaterFPTS({
        gp,
        goals: Number(stats.goals ?? ("goals" in player ? player.goals : 0)) || 0,
        assists: Number(stats.assists ?? ("assists" in player ? player.assists : 0)) || 0,
        sog: Number(stats.sog ?? ("sog" in player ? player.sog : 0)) || 0,
        hits: Number(stats.hits ?? ("hits" in player ? player.hits : 0)) || 0,
        blocks: Number(stats.blocks ?? ("blocks" in player ? player.blocks : 0)) || 0,
        ppp: Number(stats.ppp ?? 0) || 0,
        shg: Number(stats.shg ?? 0) || 0,
        gwg: Number(stats.gwg ?? 0) || 0,
        plusMinus: Number(stats.plusMinus ?? 0) || 0,
      })
  const rawTotal = (category === "G" ? stats.goals ?? ("goals" in player ? player.goals : 0)
    : category === "A" ? stats.assists ?? ("assists" in player ? player.assists : 0)
    : category === "SOG" ? stats.sog ?? ("sog" in player ? player.sog : 0)
    : category === "HIT" ? stats.hits ?? ("hits" in player ? player.hits : 0)
    : category === "BLK" ? stats.blocks ?? ("blocks" in player ? player.blocks : 0)
    : category === "W" ? stats.wins ?? ("wins" in player ? player.wins : 0)
    : category === "SV" ? stats.saves ?? ("saves" in player ? player.saves : 0)
    : stats.shutouts ?? ("shutouts" in player ? player.shutouts : 0)) ?? 0
  const total = category === "FPTS"
    ? projectionGames != null
      ? calculatedFpts === 0
        ? ((Number("projection" in player ? player.projection : "projPts" in player ? player.projPts : 0) || 0) / 3.5) * projectionGames
        : (calculatedFpts / gp) * projectionGames
      : calculatedFpts
    : projectionGames != null
      ? (rawTotal / gp) * projectionGames
      : rawTotal
  const numeric = mode === "per_game" ? total / gp : total
  return {
    numeric,
    display: mode === "per_game" ? numeric.toFixed(category === "FPTS" ? 1 : 2) : category === "FPTS" ? numeric.toFixed(1) : Math.round(numeric).toString(),
  }
}

export function getProjectedFPTS(player: MarketPlayer, games: number): number {
  const stats = getSyncedPlayerStats(player)
  const seasonFpts = getSyncedPlayerFPTS(player)
  return Number(((seasonFpts / Math.max(1, stats.gp)) * games).toFixed(1))
}
