export interface FantasyStats {
  goals?: number | null
  assists?: number | null
  shots?: number | null
  hits?: number | null
  blocks?: number | null
  powerPlayPoints?: number | null
  shorthandedGoals?: number | null
  gameWinningGoals?: number | null
  wins?: number | null
  saves?: number | null
  goalsAgainst?: number | null
  shutouts?: number | null
  otLosses?: number | null
}

const value = (number: number | null | undefined) => number ?? 0

export function calculateFantasyPoints(stats: FantasyStats): number {
  const skaterPoints =
    value(stats.goals) * 3 +
    value(stats.assists) * 2 +
    value(stats.shots) * 0.4 +
    value(stats.hits) * 0.2 +
    value(stats.blocks) * 0.5 +
    value(stats.powerPlayPoints) +
    value(stats.shorthandedGoals) * 2 +
    value(stats.gameWinningGoals)

  const goaliePoints =
    value(stats.wins) * 4 +
    value(stats.saves) * 0.2 -
    value(stats.goalsAgainst) +
    value(stats.shutouts) * 3 +
    value(stats.otLosses)

  return skaterPoints + goaliePoints
}

/** League-configurable scoring (keys match the commissioner rulebook). */
export type LeagueScoring = Partial<Record<
  "goal" | "assist" | "shot" | "hit" | "block" | "ppp" | "shg" | "gwg" | "plusMinus" | "win" | "save" | "goalsAgainst" | "shutout" | "overtimeLoss",
  number
>>

export const DEFAULT_LEAGUE_SCORING: Required<LeagueScoring> = {
  goal: 3, assist: 2, shot: 0.2, hit: 0.2, block: 0.2, ppp: 0, shg: 0, gwg: 0, plusMinus: 0,
  win: 4, save: 0.2, goalsAgainst: -1, shutout: 3, overtimeLoss: 0,
}

export interface RawGameStat {
  goals: number
  assists: number
  shots: number
  hits: number
  blocks: number
  plusMinus: number
  powerPlayPoints: number
  shorthandedGoals: number
  gameWinningGoals: number
  saves: number
  goalsAgainst: number
  shutouts: number
  decision?: string | null
}

export function scoreGameStat(stat: RawGameStat, settings: LeagueScoring | null | undefined): number {
  const s = { ...DEFAULT_LEAGUE_SCORING, ...(settings ?? {}) }
  const total =
    stat.goals * s.goal + stat.assists * s.assist + stat.shots * s.shot + stat.hits * s.hit + stat.blocks * s.block +
    stat.powerPlayPoints * s.ppp + stat.shorthandedGoals * s.shg + stat.gameWinningGoals * s.gwg + stat.plusMinus * s.plusMinus +
    (stat.decision === "W" ? s.win : 0) + (stat.decision === "OTL" || stat.decision === "OT" ? s.overtimeLoss : 0) +
    stat.saves * s.save + stat.goalsAgainst * s.goalsAgainst + stat.shutouts * s.shutout
  return Math.round(total * 100) / 100
}
