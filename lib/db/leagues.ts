import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function getLeague(leagueId: string) {
  return prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      teams: {
        orderBy: { name: "asc" },
        include: { manager: { select: { id: true, name: true, handle: true, avatarUrl: true } } },
      },
    },
  })
}

export async function getLeagueStandings(leagueId: string, season?: number) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { currentSeason: true },
  })
  if (!league) return null

  const targetSeason = season ?? league.currentSeason
  const [teams, matchups] = await Promise.all([
    prisma.team.findMany({
      where: { leagueId },
      include: { manager: { select: { handle: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.matchup.findMany({
      where: { leagueId, season: targetSeason },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    }),
  ])

  return teams
    .map((team) => {
      const record = matchups.reduce(
        (totals, matchup) => {
          const isHome = matchup.homeTeamId === team.id
          const teamScore = isHome ? matchup.homeScore : matchup.awayScore
          const opponentScore = isHome ? matchup.awayScore : matchup.homeScore
          if (teamScore === null || opponentScore === null) return totals
          const score = Number(teamScore)
          const opponent = Number(opponentScore)
          return {
            wins: totals.wins + (score > opponent ? 1 : 0),
            losses: totals.losses + (score < opponent ? 1 : 0),
            pointsFor: totals.pointsFor + score,
            pointsAgainst: totals.pointsAgainst + opponent,
          }
        },
        { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 },
      )
      return { team, ...record }
    })
    .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)
}

export async function getWeeklyMatchups(leagueId: string, season: number, week: number) {
  return prisma.matchup.findMany({
    where: { leagueId, season, week },
    include: {
      homeTeam: { select: { id: true, name: true, manager: { select: { handle: true } } } },
      awayTeam: { select: { id: true, name: true, manager: { select: { handle: true } } } },
    },
    orderBy: { id: "asc" },
  })
}

export type LeagueScoringSettings = Prisma.JsonObject
