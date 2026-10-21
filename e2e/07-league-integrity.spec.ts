import { expect, test } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { getFantasyWeekDates, getCurrentFantasyWeek } from "../lib/season-calendar"
import { computeStandings } from "../lib/standings"
import { scoreTeams } from "../lib/matchup-scoring"
import type { LeagueScoring } from "../lib/scoring"
import { scoringSlotsForWeek } from "../lib/services/week-lineups"
import { STARTER_ELIGIBILITY } from "../lib/roster-eligibility"

// Read-only checks against the live league database (nothing here writes).
process.loadEnvFile?.(".env")
const prisma = new PrismaClient()
const SEASON = 2026

test.afterAll(async () => { await prisma.$disconnect() })

test.describe("league data integrity (read-only)", () => {
  test("the league has 12 uniquely named teams, each with one manager", async () => {
    const teams = await prisma.team.findMany({ select: { name: true, managerId: true } })
    expect(teams).toHaveLength(12)
    expect(new Set(teams.map((team) => team.name)).size).toBe(12)
    expect(new Set(teams.map((team) => team.managerId)).size).toBe(12)
  })

  test("no player is rostered by two teams", async () => {
    const slots = await prisma.rosterSlot.findMany({ select: { playerId: true } })
    expect(new Set(slots.map((slot) => slot.playerId)).size).toBe(slots.length)
  })

  test("no roster exceeds the league's capacity and slot limits", async () => {
    const league = await prisma.league.findFirstOrThrow()
    const positions = (league.rosterPositions ?? {}) as Record<string, number>
    const teams = await prisma.team.findMany({ include: { rosterSlots: { select: { slot: true } } } })
    for (const team of teams) {
      const count = (slot: string) => team.rosterSlots.filter((entry) => entry.slot === slot).length
      for (const slot of ["C", "W", "F", "D", "G", "BN"]) expect(count(slot), `${team.name} ${slot}`).toBeLessThanOrEqual(positions[slot] ?? 0)
      expect(count("TAXI"), `${team.name} taxi`).toBeLessThanOrEqual(league.taxiSlots)
      expect(count("IR") + count("IR_PLUS"), `${team.name} IR`).toBeLessThanOrEqual(league.irSlots)
    }
  })

  test("taxi players are all under the league's NHL games cap", async () => {
    const league = await prisma.league.findFirstOrThrow()
    const taxi = await prisma.rosterSlot.findMany({ where: { slot: "TAXI" }, include: { player: true } })
    for (const entry of taxi) expect(entry.player.nhlGamesPlayed, entry.player.name).toBeLessThan(league.taxiMaxGames)
  })

  test("IR slots only hold players whose status is IR", async () => {
    const ir = await prisma.rosterSlot.findMany({ where: { slot: "IR" }, include: { player: true } })
    for (const entry of ir) expect(entry.player.injuryStatus, entry.player.name).toBe("IR")
  })

  test("starters are position-eligible for their slot", async () => {
    const starters = await prisma.rosterSlot.findMany({ where: { slot: { in: ["C", "W", "F", "D", "G"] } }, include: { player: true } })
    for (const entry of starters) expect(STARTER_ELIGIBILITY[entry.slot], `${entry.player.name} in ${entry.slot}`).toContain(entry.player.position)
  })

  test("every team plays exactly one opponent each week and never itself", async () => {
    const matchups = await prisma.matchup.findMany({ where: { season: SEASON } })
    const weeks = new Set(matchups.map((matchup) => matchup.week))
    expect(weeks.size).toBeGreaterThanOrEqual(20)
    for (const week of weeks) {
      const inWeek = matchups.filter((matchup) => matchup.week === week)
      const ids = inWeek.flatMap((matchup) => [matchup.homeTeamId, matchup.awayTeamId])
      expect(ids, `week ${week} plays 12 distinct teams`).toHaveLength(12)
      expect(new Set(ids).size, `week ${week} no team twice`).toBe(12)
    }
  })

  test("league week follows the NHL calendar (today is never behind the calendar)", async () => {
    const league = await prisma.league.findFirstOrThrow()
    expect(league.currentWeek).toBe(getCurrentFantasyWeek(SEASON))
  })

  test("every NHL game is stored under its own date (no week bucketed on a single day)", async () => {
    const week = getCurrentFantasyWeek(SEASON)
    const { dates } = getFantasyWeekDates(week, SEASON)
    const games = await prisma.nhlGame.findMany({ where: { gameDate: { in: dates } }, select: { gameDate: true } })
    expect(games.length).toBeGreaterThan(0)
    expect(new Set(games.map((game) => game.gameDate)).size).toBeGreaterThan(2)
  })

  test("finished NHL games all have player stat lines", async () => {
    const missing = await prisma.nhlGame.count({ where: { gameState: { in: ["FINAL", "OFF"] }, gameStats: { none: {} } } })
    expect(missing).toBe(0)
  })
})

test.describe("retroactive matchup scores and standings", () => {
  test("weeks before the current one are final and carry scores", async () => {
    const current = getCurrentFantasyWeek(SEASON)
    const past = await prisma.matchup.findMany({ where: { season: SEASON, week: { lt: current } } })
    expect(past.length).toBeGreaterThan(0)
    for (const matchup of past) {
      expect(matchup.isFinal, `week ${matchup.week}`).toBe(true)
      expect(matchup.homeScore).not.toBeNull()
      expect(matchup.awayScore).not.toBeNull()
    }
  })

  test("future weeks are never final", async () => {
    const current = getCurrentFantasyWeek(SEASON)
    const future = await prisma.matchup.findMany({ where: { season: SEASON, week: { gt: current } } })
    for (const matchup of future) expect(matchup.isFinal).toBe(false)
  })

  test("stored scores match a fresh calculation from boxscores and the league scoring rules", async () => {
    const league = await prisma.league.findFirstOrThrow()
    for (const week of [1, 2]) {
      const slots = await scoringSlotsForWeek(league.id, SEASON, week)
      const { dates } = getFantasyWeekDates(week, SEASON)
      const stats = await prisma.playerGameStat.findMany({ where: { game: { gameDate: { in: dates } } } })
      const totals = scoreTeams(slots, stats, league.scoringSettings as LeagueScoring)
      const matchups = await prisma.matchup.findMany({ where: { season: SEASON, week } })
      for (const matchup of matchups) {
        expect(Number(matchup.homeScore), `w${week} home`).toBeCloseTo(totals.get(matchup.homeTeamId) ?? 0, 1)
        expect(Number(matchup.awayScore), `w${week} away`).toBeCloseTo(totals.get(matchup.awayTeamId) ?? 0, 1)
      }
    }
  })

  test("standings equal the sum of the final matchup results in the database", async () => {
    const league = await prisma.league.findFirstOrThrow()
    const teams = await prisma.team.findMany({ select: { id: true } })
    const matchups = await prisma.matchup.findMany({ where: { season: SEASON, isFinal: true } })
    const standings = computeStandings(teams.map((team) => team.id), matchups, getCurrentFantasyWeek(SEASON))
    const games = standings.reduce((sum, row) => sum + row.wins + row.losses + row.ties, 0)
    expect(games).toBe(matchups.length * 2)
    expect(league.currentWeek).toBeGreaterThanOrEqual(3)
    const pointsFor = standings.reduce((sum, row) => sum + row.pointsFor, 0)
    const pointsAgainst = standings.reduce((sum, row) => sum + row.pointsAgainst, 0)
    expect(pointsFor).toBeCloseTo(pointsAgainst, 1)
  })
})
