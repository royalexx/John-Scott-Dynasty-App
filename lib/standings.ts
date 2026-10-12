export interface StandingMatchup {
  week: number
  homeTeamId: string
  awayTeamId: string
  homeScore: { toString(): string } | number | null
  awayScore: { toString(): string } | number | null
  isFinal: boolean
}

export interface StandingRecord {
  teamId: string
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  streak: string | null
}

/** A matchup counts toward standings once it is final (or an earlier week that already has recorded scores). */
export function isCompletedMatchup(matchup: StandingMatchup, currentWeek: number): boolean {
  if (matchup.homeScore === null || matchup.awayScore === null) return false
  return matchup.isFinal || matchup.week < currentWeek
}

export function computeStandings(teamIds: string[], matchups: StandingMatchup[], currentWeek: number): StandingRecord[] {
  const completed = matchups
    .filter((matchup) => isCompletedMatchup(matchup, currentWeek))
    .sort((a, b) => b.week - a.week)

  const records = teamIds.map((teamId) => {
    let wins = 0, losses = 0, ties = 0, pointsFor = 0, pointsAgainst = 0
    const results: Array<"W" | "L" | "T"> = []
    for (const matchup of completed) {
      if (matchup.homeTeamId !== teamId && matchup.awayTeamId !== teamId) continue
      const home = matchup.homeTeamId === teamId
      const score = Number(home ? matchup.homeScore : matchup.awayScore)
      const opponent = Number(home ? matchup.awayScore : matchup.homeScore)
      pointsFor += score
      pointsAgainst += opponent
      const result = score > opponent ? "W" : score < opponent ? "L" : "T"
      if (result === "W") wins += 1
      else if (result === "L") losses += 1
      else ties += 1
      results.push(result)
    }
    const latest = results[0]
    let count = 0
    while (latest && results[count] === latest) count += 1
    return {
      teamId, wins, losses, ties,
      pointsFor: Math.round(pointsFor * 100) / 100,
      pointsAgainst: Math.round(pointsAgainst * 100) / 100,
      streak: latest ? `${count}${latest}` : null,
    }
  })

  return records.sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.pointsFor - a.pointsFor)
}
