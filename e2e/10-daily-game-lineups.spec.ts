import { expect, test } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { getCurrentFantasyWeek, getEasternDate, getFantasyWeekDates } from "../lib/season-calendar"
import { captureStartedDailyGamesForTeam, dailyScoringEntries } from "../lib/services/daily-game-lineups"
import { updateWeeklyMatchupScores } from "../lib/services/nhl-sync"

const prisma = new PrismaClient()
test.afterAll(async () => { await prisma.$disconnect() })

test("DAILY snapshots capture players once per NHL game, including empty headers", async () => {
  const league = await prisma.league.findFirstOrThrow()
  const team = await prisma.team.findFirstOrThrow({ where: { name: "Montreal Monarchs" } })
  const week = getCurrentFantasyWeek(league.currentSeason)
  const { dates } = getFantasyWeekDates(week, league.currentSeason)
  const games = await prisma.nhlGame.findMany({ where: { gameDate: { in: dates } }, orderBy: { startTimeUTC: "asc" } })
  const game = games.find((entry) => {
    const now = new Date(entry.startTimeUTC.getTime() + 60_000)
    return entry.gameDate === getEasternDate(now) && getCurrentFantasyWeek(league.currentSeason, now) === week
  })
  test.skip(!game, "Requires a scheduled NHL game in the current fantasy week")
  const now = new Date(game!.startTimeUTC.getTime() + 60_000)
  const before = await prisma.dailyGameLineup.findMany({ where: { teamId: team.id, season: league.currentSeason, week }, select: { id: true } })
  const beforeIds = new Set(before.map((row) => row.id))
  const capture = async () => prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${team.id}))`
    return captureStartedDailyGamesForTeam(tx, team.id, league.currentSeason, now)
  })
  try {
    const created = await capture()
    expect(created).toBeGreaterThanOrEqual(1)
    const snapshot = await prisma.dailyGameLineup.findUniqueOrThrow({
      where: { teamId_gameId: { teamId: team.id, gameId: game!.id } },
      include: { entries: true },
    })
    expect(snapshot.week).toBe(week)
    expect(snapshot.capturedAt.getTime()).toBe(now.getTime())
    const players = await prisma.rosterSlot.findMany({
      where: { teamId: team.id, player: { teamAbbrev: { in: [game!.homeTeamAbbrev, game!.awayTeamAbbrev] } } },
      select: { playerId: true, slot: true },
    })
    expect(snapshot.entries.map((row) => ({ playerId: row.playerId, slot: row.slot })).sort((a, b) => a.playerId - b.playerId))
      .toEqual(players.sort((a, b) => a.playerId - b.playerId))
    expect(await capture()).toBe(0)
    const again = await prisma.dailyGameLineup.findUniqueOrThrow({
      where: { teamId_gameId: { teamId: team.id, gameId: game!.id } }, include: { entries: true },
    })
    expect(again).toEqual(snapshot)
    const scoring = await dailyScoringEntries(team.leagueId, league.currentSeason, week, [game!.id], [team.id])
    expect(scoring).not.toBeNull()
    expect(scoring).toHaveLength(snapshot.entries.length)
  } finally {
    const after = await prisma.dailyGameLineup.findMany({ where: { teamId: team.id, season: league.currentSeason, week }, select: { id: true } })
    const inserted = after.filter((row) => !beforeIds.has(row.id)).map((row) => row.id)
    if (inserted.length > 0) await prisma.dailyGameLineup.deleteMany({ where: { id: { in: inserted } } })
  }
})

test("DAILY historical recomputation cannot invent missing game-day assignments", async () => {
  const league = await prisma.league.findFirstOrThrow()
  const week = 2
  test.skip(getCurrentFantasyWeek(league.currentSeason) <= week, "Requires an earlier fantasy week")
  const original = await prisma.matchup.findMany({
    where: { leagueId: league.id, season: league.currentSeason, week },
    orderBy: { id: "asc" },
    select: { id: true, homeScore: true, awayScore: true, homePoints: true, awayPoints: true, isFinal: true },
  })
  test.skip(original.length === 0, "Requires seeded historical matchups")
  const snapshots = await prisma.dailyGameLineup.count({ where: { season: league.currentSeason, week, team: { leagueId: league.id } } })
  test.skip(snapshots > 0, "Fixture already has per-game historical lineup evidence")
  try {
    await prisma.league.update({ where: { id: league.id }, data: { lineupLockMode: "DAILY" } })
    expect(await updateWeeklyMatchupScores(league.id, week)).toBe(0)
    const after = await prisma.matchup.findMany({
      where: { leagueId: league.id, season: league.currentSeason, week },
      orderBy: { id: "asc" },
      select: { id: true, homeScore: true, awayScore: true, homePoints: true, awayPoints: true, isFinal: true },
    })
    expect(after).toEqual(original)
  } finally {
    await prisma.league.update({ where: { id: league.id }, data: { lineupLockMode: league.lineupLockMode } })
  }
})
