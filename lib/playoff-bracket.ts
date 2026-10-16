/**
 * Six-team bracket, one week per round, matching the league's current playoff picture.
 * Seeds 1 and 2 bye in week 15. Seed 1 then plays the winner of 4 vs 5.
 * Seed 2 plays the winner of 3 vs 6. A tie goes to the higher seed.
 */

export const PLAYOFF_START_WEEK = 15
export const PLAYOFF_TEAM_COUNT = 6

export type PlayoffResult = {
  week: number
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  isFinal: boolean
}

export type PlayoffStanding = {
  team: string
}

export type BracketSide = {
  seed: number | null
  team: string | null
  label: string
  points: number | null
  winner: boolean
}

export type BracketGame = {
  id: string
  week: number
  status: "Projected" | "Live" | "Final" | "Bye"
  home: BracketSide
  away: BracketSide | null
}

export type PlayoffRound = {
  title: string
  week: number
  games: BracketGame[]
}

export type PlayoffBracketView = {
  live: boolean
  rounds: PlayoffRound[]
}

type Seeded = { seed: number; team: string }

function rankedTeams(standings: PlayoffStanding[], results: PlayoffResult[], currentWeek: number): string[] {
  const names = standings.map((row) => row.team)
  if (currentWeek < PLAYOFF_START_WEEK) return names
  const table = new Map(names.map((team, index) => [team, { team, wins: 0, losses: 0, pointsFor: 0, index }]))
  for (const game of results) {
    if (game.week >= PLAYOFF_START_WEEK) continue
    if (!(game.isFinal || game.week < currentWeek)) continue
    const sides = [
      [game.homeTeam, game.homeScore, game.awayScore],
      [game.awayTeam, game.awayScore, game.homeScore],
    ] as const
    for (const [team, score, opponent] of sides) {
      const row = table.get(team)
      if (!row) continue
      row.pointsFor += score
      if (score > opponent) row.wins += 1
      else if (score < opponent) row.losses += 1
    }
  }
  return [...table.values()]
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.pointsFor - a.pointsFor || a.index - b.index)
    .map((row) => row.team)
}

function weekScore(results: PlayoffResult[], week: number, team: string) {
  const game = results.find((result) => result.week === week && (result.homeTeam === team || result.awayTeam === team))
  if (!game) return null
  return {
    points: game.homeTeam === team ? game.homeScore : game.awayScore,
    final: game.isFinal,
  }
}

function side(seed: number | null, team: string | null, label: string, points: number | null, winner = false): BracketSide {
  return { seed, team, label, points, winner }
}

function teamLabel(seed: number, team: string | null) {
  return team ? `#${seed} ${team}` : `#${seed}`
}

function series(id: string, week: number, homeSeed: Seeded | null, awaySeed: Seeded | null, results: PlayoffResult[], currentWeek: number, pendingLabel: string): BracketGame & { winnerTeam: string | null; loserTeam: string | null } {
  const started = currentWeek >= week
  const homeLine = homeSeed && started ? weekScore(results, week, homeSeed.team) : null
  const awayLine = awaySeed && started ? weekScore(results, week, awaySeed.team) : null
  const bothFinal = Boolean(homeLine?.final && awayLine?.final && homeSeed && awaySeed)
  let winnerTeam: string | null = null
  let loserTeam: string | null = null
  if (bothFinal && homeSeed && awaySeed && homeLine && awayLine) {
    if (homeLine.points > awayLine.points || (homeLine.points === awayLine.points && homeSeed.seed < awaySeed.seed)) {
      winnerTeam = homeSeed.team
      loserTeam = awaySeed.team
    } else {
      winnerTeam = awaySeed.team
      loserTeam = homeSeed.team
    }
  }
  const status = !started || !homeSeed || !awaySeed ? "Projected" : bothFinal ? "Final" : "Live"
  return {
    id,
    week,
    status,
    home: side(homeSeed?.seed ?? null, homeSeed?.team ?? null, homeSeed ? teamLabel(homeSeed.seed, homeSeed.team) : pendingLabel, started && homeLine ? homeLine.points : null, winnerTeam != null && winnerTeam === homeSeed?.team),
    away: side(awaySeed?.seed ?? null, awaySeed?.team ?? null, awaySeed ? teamLabel(awaySeed.seed, awaySeed.team) : pendingLabel, started && awayLine ? awayLine.points : null, winnerTeam != null && winnerTeam === awaySeed?.team),
    winnerTeam,
    loserTeam,
  }
}

function seeded(seed: number, teams: string[]): Seeded | null {
  const team = teams[seed - 1]
  return team ? { seed, team } : null
}

function advanced(game: BracketGame & { winnerTeam: string | null; loserTeam: string | null }, which: "winner" | "loser"): Seeded | null {
  const team = which === "winner" ? game.winnerTeam : game.loserTeam
  if (!team) return null
  const winnerSide = game.home.winner ? game.home : game.away
  const loserSide = game.home.winner ? game.away : game.home
  const picked = which === "winner" ? winnerSide : loserSide
  return picked?.seed != null ? { seed: picked.seed, team } : { seed: 0, team }
}

export function buildPlayoffBracket({ standings, results, currentWeek }: { standings: PlayoffStanding[]; results: PlayoffResult[]; currentWeek: number }): PlayoffBracketView {
  const teams = rankedTeams(standings, results, currentWeek)
  const seed = (rank: number) => seeded(rank, teams)
  const firstHigh = series("r1-4-5", 15, seed(4), seed(5), results, currentWeek, "Winner of #4 vs #5")
  const firstLow = series("r1-3-6", 15, seed(3), seed(6), results, currentWeek, "Winner of #3 vs #6")
  const semiOne = series("semi-1", 16, seed(1), advanced(firstHigh, "winner"), results, currentWeek, "Winner of #4 vs #5")
  const semiTwo = series("semi-2", 16, seed(2), advanced(firstLow, "winner"), results, currentWeek, "Winner of #3 vs #6")
  const final = series("final", 17, advanced(semiOne, "winner"), advanced(semiTwo, "winner"), results, currentWeek, "Winner of semifinals")
  const thirdHome = advanced(semiOne, "loser")
  const thirdAway = advanced(semiTwo, "loser")
  const third = series("third", 17, thirdHome, thirdAway, results, currentWeek, "Semifinal loser")
  const bye = (rank: number): BracketGame => ({
    id: `bye-${rank}`,
    week: 15,
    status: "Bye",
    home: side(rank, teams[rank - 1] ?? null, teamLabel(rank, teams[rank - 1] ?? null), null),
    away: null,
  })

  return {
    live: currentWeek >= PLAYOFF_START_WEEK,
    rounds: [
      { title: "Round 1 · Week 15", week: 15, games: [bye(1), bye(2), firstLow, firstHigh] },
      { title: "Semifinals · Week 16", week: 16, games: [semiOne, semiTwo] },
      { title: "Finals · Week 17", week: 17, games: [final, third] },
    ],
  }
}
