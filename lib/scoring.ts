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
