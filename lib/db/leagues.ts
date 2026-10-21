import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { computeStandings } from "@/lib/standings"
import { getCurrentFantasyWeek } from "@/lib/season-calendar"

export async function getLeague(leagueId: string) {
  return prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      teams: {
        orderBy: { name: "asc" },
        include: { manager: { select: { id: true, name: true, handle: true, avatarUrl: true, isCommissioner: true } } },
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
  const currentWeek = getCurrentFantasyWeek(targetSeason)
  const [teams, matchups] = await Promise.all([
    prisma.team.findMany({
      where: { leagueId },
      include: { manager: { select: { handle: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.matchup.findMany({
      where: { leagueId, season: targetSeason },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, week: true, isFinal: true },
    }),
  ])

  const teamsById = new Map(teams.map((team) => [team.id, team]))
  return computeStandings(teams.map((team) => team.id), matchups, currentWeek).map((record) => {
    const team = teamsById.get(record.teamId)!
    return { team, wins: record.wins, losses: record.losses, ties: record.ties, pointsFor: record.pointsFor, pointsAgainst: record.pointsAgainst, streak: record.streak }
  })
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
