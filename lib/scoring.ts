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

/** League-configurable scoring (keys match the commissioner rulebook). */
export type LeagueScoring = Partial<Record<
  "goal" | "assist" | "shot" | "hit" | "block" | "ppp" | "shg" | "gwg" | "plusMinus" | "win" | "save" | "goalsAgainst" | "shutout" | "overtimeLoss",
  number
>>

export const DEFAULT_LEAGUE_SCORING: Required<LeagueScoring> = {
  goal: 3, assist: 2, shot: 0.2, hit: 0.2, block: 0.2, ppp: 0, shg: 0, gwg: 0, plusMinus: 0,
  win: 4, save: 0.2, goalsAgainst: -1, shutout: 3, overtimeLoss: 0,
}

export function calculateFantasyPoints(stats: FantasyStats): number {
  const scoring = DEFAULT_LEAGUE_SCORING
  const total =
    value(stats.goals) * scoring.goal +
    value(stats.assists) * scoring.assist +
    value(stats.shots) * scoring.shot +
    value(stats.hits) * scoring.hit +
    value(stats.blocks) * scoring.block +
    value(stats.powerPlayPoints) * scoring.ppp +
    value(stats.shorthandedGoals) * scoring.shg +
    value(stats.gameWinningGoals) * scoring.gwg +
    value(stats.wins) * scoring.win +
    value(stats.saves) * scoring.save +
    value(stats.goalsAgainst) * scoring.goalsAgainst +
    value(stats.shutouts) * scoring.shutout +
    value(stats.otLosses) * scoring.overtimeLoss
  return Math.round(total * 100) / 100
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

export interface CountingLine {
  goals?: number | null
  assists?: number | null
  shots?: number | null
  hits?: number | null
  blocks?: number | null
  plusMinus?: number | null
  powerPlayPoints?: number | null
  shorthandedGoals?: number | null
  gameWinningGoals?: number | null
  wins?: number | null
  overtimeLosses?: number | null
  saves?: number | null
  goalsAgainst?: number | null
  shutouts?: number | null
}

/** Same weights as `scoreGameStat`, for a season total or any other counting line. */
export function scoreCountingLine(counts: CountingLine, settings: LeagueScoring | null | undefined): number {
  const s = { ...DEFAULT_LEAGUE_SCORING, ...(settings ?? {}) }
  const n = (number: number | null | undefined) => number ?? 0
  const total =
    n(counts.goals) * s.goal +
    n(counts.assists) * s.assist +
    n(counts.shots) * s.shot +
    n(counts.hits) * s.hit +
    n(counts.blocks) * s.block +
    n(counts.powerPlayPoints) * s.ppp +
    n(counts.shorthandedGoals) * s.shg +
    n(counts.gameWinningGoals) * s.gwg +
    n(counts.plusMinus) * s.plusMinus +
    n(counts.wins) * s.win +
    n(counts.overtimeLosses) * s.overtimeLoss +
    n(counts.saves) * s.save +
    n(counts.goalsAgainst) * s.goalsAgainst +
    n(counts.shutouts) * s.shutout
  return Math.round(total * 100) / 100
}

export function scoreGameStat(stat: RawGameStat, settings: LeagueScoring | null | undefined): number {
  return scoreCountingLine({
    goals: stat.goals,
    assists: stat.assists,
    shots: stat.shots,
    hits: stat.hits,
    blocks: stat.blocks,
    plusMinus: stat.plusMinus,
    powerPlayPoints: stat.powerPlayPoints,
    shorthandedGoals: stat.shorthandedGoals,
    gameWinningGoals: stat.gameWinningGoals,
    wins: stat.decision === "W" ? 1 : 0,
    overtimeLosses: stat.decision === "OTL" || stat.decision === "OT" ? 1 : 0,
    saves: stat.saves,
    goalsAgainst: stat.goalsAgainst,
    shutouts: stat.shutouts,
  }, settings)
}
