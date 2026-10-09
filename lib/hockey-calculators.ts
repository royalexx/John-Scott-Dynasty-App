import {
  calculateGoalieFPTS,
  calculateSkaterFPTS,
  type GoalieStats,
  type MarketPlayer,
  type Player,
  type SkaterStats,
} from "@/lib/hockey-data"

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
      saves: current?.saves ?? player.saves ?? 0,
      goalsAgainst: current?.goalsAgainst ?? 0,
      shutouts: current?.shutouts ?? player.shutouts ?? 0,
      savePct: current?.savePct ?? player.savePct ?? 0,
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
  }
}

export function getSyncedPlayerFPTS(player: MarketPlayer): number {
  const stats = getSyncedPlayerStats(player)
  return player.position === "G" ? calculateGoalieFPTS(stats as GoalieStats) : calculateSkaterFPTS(stats as SkaterStats)
}

export function getLeaderStat(
  player: SearchPlayer,
  category: LeaderCategory,
  mode: LeaderMode,
  projectionGames?: number,
): { numeric: number; display: string } {
  const source = "currentSeasonStats" in player && "position" in player
    ? getSyncedPlayerStats(player as MarketPlayer)
    : "stats" in player && player.stats ? player.stats : player
  const rawGp = Number("gp" in source ? source.gp : "gamesPlayed" in player ? player.gamesPlayed : "gp" in player ? player.gp : 20)
  const gp = Number.isFinite(rawGp) ? Math.max(1, rawGp) : 1
  const stats = source as unknown as Record<string, number | undefined>
  if (category === "SV%") {
    const savePct = stats.savePct ?? ("savePct" in player ? player.savePct : 0.915) ?? 0.915
    return { numeric: savePct, display: savePct.toFixed(3) }
  }

  const calculatedFpts = player.position === "G"
    ? calculateGoalieFPTS({
        gp,
        wins: Number(stats.wins ?? ("wins" in player ? player.wins : 0)) || 0,
        saves: Number(stats.saves ?? ("saves" in player ? player.saves : 0)) || 0,
        goalsAgainst: Number(stats.goalsAgainst ?? 0) || 0,
        shutouts: Number(stats.shutouts ?? ("shutouts" in player ? player.shutouts : 0)) || 0,
        savePct: Number(stats.savePct ?? ("savePct" in player ? player.savePct : 0.915)) || 0.915,
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
      })
  const total = (category === "FPTS"
    ? projectionGames ? (calculatedFpts / gp) * projectionGames : calculatedFpts
    : category === "G" ? stats.goals ?? ("goals" in player ? player.goals : 0)
    : category === "A" ? stats.assists ?? ("assists" in player ? player.assists : 0)
    : category === "SOG" ? stats.sog ?? ("sog" in player ? player.sog : 0)
    : category === "HIT" ? stats.hits ?? ("hits" in player ? player.hits : 0)
    : category === "BLK" ? stats.blocks ?? ("blocks" in player ? player.blocks : 0)
    : category === "W" ? stats.wins ?? ("wins" in player ? player.wins : 0)
    : category === "SV" ? stats.saves ?? ("saves" in player ? player.saves : 0)
    : stats.shutouts ?? ("shutouts" in player ? player.shutouts : 0)) ?? 0
  const numeric = mode === "per_game" ? total / gp : total
  return {
    numeric,
    display: mode === "per_game" ? numeric.toFixed(category === "FPTS" ? 1 : 2) : category === "FPTS" ? numeric.toFixed(1) : Math.round(numeric).toString(),
  }
}

export function getProjectedFPTS(player: MarketPlayer, games: number): number {
  const stats = getSyncedPlayerStats(player)
  const seasonFpts = player.position === "G" ? calculateGoalieFPTS(stats as GoalieStats) : calculateSkaterFPTS(stats as SkaterStats)
  return Number(((seasonFpts / Math.max(1, stats.gp)) * games).toFixed(1))
}
