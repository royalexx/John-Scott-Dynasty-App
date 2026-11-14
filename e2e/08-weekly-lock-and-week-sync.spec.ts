import { expect, test } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { getCurrentFantasyWeek, getFantasyWeekDates } from "../lib/season-calendar"
import { freezeWeekLineup, missingSnapshotTeamIds, scoringSlotsForWeek, weekLineupForLeague } from "../lib/services/week-lineups"
import { updateWeeklyMatchupScores } from "../lib/services/nhl-sync"
import { activateDueLineupPlans, saveFutureLineupMove } from "../lib/services/future-lineup-plans"
import { positionFitsSlot } from "../lib/roster-eligibility"

const prisma = new PrismaClient()
test.afterAll(async () => { await prisma.$disconnect() })

async function weekHasStarted() {
  const { dates } = getFantasyWeekDates(getCurrentFantasyWeek(2026), 2026)
  const first = await prisma.nhlGame.findFirst({ where: { gameDate: { in: dates } }, orderBy: { startTimeUTC: "asc" } })
  return Boolean(first && first.startTimeUTC.getTime() <= Date.now())
}

test.describe("league settings: lineup lock option", () => {
  test("GET exposes the lock mode (weekly by default)", async ({ request }) => {
    const response = await request.get("/api/admin/league-settings")
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(["WEEKLY", "DAILY"]).toContain(body.lineupLockMode)
  })

  test("PATCH rejects an unknown lock mode", async ({ request }) => {
    const response = await request.patch("/api/admin/league-settings", { data: { lineupLockMode: "HOURLY" } })
    expect(response.status()).toBe(400)
  })

  test("PATCH ignores attempts to hand-set the league week", async ({ request }) => {
    const before = await (await request.get("/api/admin/league-settings")).json()
    const response = await request.patch("/api/admin/league-settings", { data: { currentWeek: 17 } })
    expect(response.status()).toBe(200)
    expect((await response.json()).currentWeek).toBe(before.currentWeek)
  })

  test("the mode can be switched and restored (self-reverting)", async ({ request }) => {
    const original = (await (await request.get("/api/admin/league-settings")).json()).lineupLockMode as "WEEKLY" | "DAILY"
    const other = original === "WEEKLY" ? "DAILY" : "WEEKLY"
    try {
      const response = await request.patch("/api/admin/league-settings", { data: { lineupLockMode: other } })
      expect(response.status()).toBe(200)
      expect((await (await request.get("/api/admin/league-settings")).json()).lineupLockMode).toBe(other)
    } finally {
      await request.patch("/api/admin/league-settings", { data: { lineupLockMode: original } })
    }
    expect((await (await request.get("/api/admin/league-settings")).json()).lineupLockMode).toBe(original)
  })

  test("the rulebook shows the lock option under Roster", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "LEAGUE", exact: true }).click()
    await page.getByRole("button", { name: /settings/i }).first().click()
    await expect(page.getByText("Lineup lock").first()).toBeVisible()
  })
})

test.describe("weekly starter lock", () => {
  test("anonymous roster moves are rejected", async ({ playwright, baseURL }) => {
    const anonymous = await playwright.request.newContext({ baseURL })
    const response = await anonymous.post("/api/roster/move", { data: { teamId: "x", playerId: 1, targetSlot: "BN" } })
    expect([401, 403]).toContain(response.status())
    await anonymous.dispose()
  })

  test("after the first game of the week a starter cannot be benched (rejected, nothing changes)", async ({ request }) => {
    const league = await prisma.league.findFirstOrThrow()
    test.skip(league.lineupLockMode !== "WEEKLY" || !(await weekHasStarted()), "needs weekly mode and a started week")
    const team = await prisma.team.findFirstOrThrow({ where: { name: "Montreal Monarchs" } })
    const starter = await prisma.rosterSlot.findFirstOrThrow({ where: { teamId: team.id, slot: { in: ["C", "W", "F", "D"] } } })
    const response = await request.post("/api/roster/move", { data: { teamId: team.id, playerId: starter.playerId, targetSlot: "BN" } })
    expect(response.status()).toBe(400)
    expect((await response.json()).error).toMatch(/locked/i)
    const after = await prisma.rosterSlot.findUniqueOrThrow({ where: { id: starter.id } })
    expect(after.slot).toBe(starter.slot)
  })

  test("after the first game a bench player cannot be pulled into a starting slot", async ({ request }) => {
    const league = await prisma.league.findFirstOrThrow()
    test.skip(league.lineupLockMode !== "WEEKLY" || !(await weekHasStarted()), "needs weekly mode and a started week")
    const team = await prisma.team.findFirstOrThrow({ where: { name: "Montreal Monarchs" } })
    const bench = await prisma.rosterSlot.findFirst({ where: { teamId: team.id, slot: "BN", player: { position: { in: ["C", "LW", "RW", "D"] } } }, include: { player: true } })
    test.skip(!bench, "no skater on the bench")
    const target = bench!.player.position === "D" ? "D" : "F"
    const response = await request.post("/api/roster/move", { data: { teamId: team.id, playerId: bench!.playerId, targetSlot: target } })
    expect(response.status()).toBe(400)
    expect((await response.json()).error).toMatch(/locked/i)
  })

  test("the lineup page tells the manager that starters are locked", async ({ page }) => {
    const league = await prisma.league.findFirstOrThrow()
    test.skip(league.lineupLockMode !== "WEEKLY" || !(await weekHasStarted()), "needs weekly mode and a started week")
    await page.goto("/")
    await expect(page.getByTestId("lineup-lock-banner")).toContainText("locked until Monday")
  })

  test("future-week moves persist separately without changing live roster or frozen results", async ({ request }) => {
    const league = await prisma.league.findFirstOrThrow()
    const futureWeek = getCurrentFantasyWeek(league.currentSeason) + 1
    test.skip(futureWeek > 24, "No future fantasy week remains in this season")
    const team = await prisma.team.findFirstOrThrow({ where: { name: "Montreal Monarchs" } })
    const roster = await prisma.rosterSlot.findMany({ where: { teamId: team.id }, include: { player: true }, orderBy: { id: "asc" } })
    const bench = roster.find((row) => row.slot === "BN" && roster.some((target) =>
      ["C", "W", "F", "D", "G"].includes(target.slot) && positionFitsSlot(target.slot, row.player.position)))
    const starter = bench && roster.find((row) => ["C", "W", "F", "D", "G"].includes(row.slot) && positionFitsSlot(row.slot, bench.player.position))
    test.skip(!bench || !starter, "Requires an eligible bench/starter pair")
    const before = roster.map(({ id, playerId, slot, lockedAt }) => ({ id, playerId, slot, lockedAt }))
    const futureSnapshotsBefore = await prisma.weekLineup.count({ where: { teamId: team.id, season: league.currentSeason, week: futureWeek } })
    try {
      const response = await request.post("/api/roster/move", {
        data: { teamId: team.id, playerId: bench!.playerId, targetSlot: starter!.slot, targetPlayerId: starter!.playerId, week: futureWeek },
      })
      expect(response.status(), await response.text()).toBe(200)
      const payload = await response.json()
      expect(payload.planned).toBe(true)
      expect(payload.lineup.source).toBe("plan")
      const saved = await prisma.lineupPlan.findUniqueOrThrow({
        where: { teamId_season_week: { teamId: team.id, season: league.currentSeason, week: futureWeek } },
        include: { entries: true },
      })
      expect(saved.status).toBe("PENDING")
      expect(saved.entries).toHaveLength(roster.length)
      expect(saved.entries.find((entry) => entry.playerId === bench!.playerId)?.slot).toBe(starter!.slot)
      expect(saved.entries.find((entry) => entry.playerId === starter!.playerId)?.slot).toBe("BN")
      const refreshed = await request.get(`/api/roster/week?week=${futureWeek}`)
      expect(refreshed.status()).toBe(200)
      expect((await refreshed.json()).source).toBe("plan")
      const current = await prisma.rosterSlot.findMany({ where: { teamId: team.id }, orderBy: { id: "asc" }, select: { id: true, playerId: true, slot: true, lockedAt: true } })
      expect(current).toEqual(before)
      expect(await prisma.weekLineup.count({ where: { teamId: team.id, season: league.currentSeason, week: futureWeek } })).toBe(futureSnapshotsBefore)
    } finally {
      await prisma.lineupPlan.deleteMany({ where: { teamId: team.id, season: league.currentSeason, week: futureWeek } })
    }
  })

  test("a due plan activates once before puck drop and updates only its team's live slots", async () => {
    const league = await prisma.league.findFirstOrThrow()
    const futureWeek = getCurrentFantasyWeek(league.currentSeason) + 1
    test.skip(futureWeek > 24, "No future fantasy week remains in this season")
    const team = await prisma.team.findFirstOrThrow({ where: { name: "Montreal Monarchs" } })
    const roster = await prisma.rosterSlot.findMany({ where: { teamId: team.id }, include: { player: true } })
    const bench = roster.find((row) => row.slot === "BN" && roster.some((target) =>
      ["C", "W", "F", "D", "G"].includes(target.slot) && positionFitsSlot(target.slot, row.player.position)))
    const starter = bench && roster.find((row) => ["C", "W", "F", "D", "G"].includes(row.slot) && positionFitsSlot(row.slot, bench.player.position))
    test.skip(!bench || !starter, "Requires an eligible bench/starter pair")
    const before = roster.map(({ id, slot }) => ({ id, slot }))
    try {
      await saveFutureLineupMove(team.id, futureWeek, bench!.playerId, starter!.slot, starter!.playerId)
      const monday = new Date(`${getFantasyWeekDates(futureWeek, league.currentSeason).startDate}T12:00:00Z`)
      const activated = await activateDueLineupPlans(team.leagueId, league.currentSeason, monday)
      expect(activated.applied).toBe(1)
      expect((await activateDueLineupPlans(team.leagueId, league.currentSeason, monday)).applied).toBe(0)
      const plan = await prisma.lineupPlan.findUniqueOrThrow({ where: { teamId_season_week: { teamId: team.id, season: league.currentSeason, week: futureWeek } } })
      expect(plan.status).toBe("APPLIED")
      expect(plan.activatedAt).not.toBeNull()
      expect((await prisma.rosterSlot.findUniqueOrThrow({ where: { id: bench!.id } })).slot).toBe(starter!.slot)
      expect((await prisma.rosterSlot.findUniqueOrThrow({ where: { id: starter!.id } })).slot).toBe("BN")
    } finally {
      await prisma.$transaction(before.map((row) => prisma.rosterSlot.update({ where: { id: row.id }, data: { slot: row.slot } })))
      await prisma.lineupPlan.deleteMany({ where: { teamId: team.id, season: league.currentSeason, week: futureWeek } })
    }
  })

  test("incomplete historical lineups cannot overwrite persisted matchup scores", async () => {
    const league = await prisma.league.findFirstOrThrow()
    const historicalWeek = 2
    test.skip(getCurrentFantasyWeek(league.currentSeason) <= historicalWeek, "needs a past completed fantasy week")

    const before = await prisma.matchup.findMany({
      where: { leagueId: league.id, season: league.currentSeason, week: historicalWeek },
      orderBy: { id: "asc" },
      select: { id: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, homePoints: true, awayPoints: true, isFinal: true },
    })
    test.skip(before.length === 0, "requires a historical seeded matchup")
    const participants = [...new Set(before.flatMap((matchup) => [matchup.homeTeamId, matchup.awayTeamId]))]
    const snapshots = await prisma.weekLineup.findMany({ where: { season: league.currentSeason, week: historicalWeek, teamId: { in: participants } }, select: { teamId: true } })
    test.skip(missingSnapshotTeamIds(participants, snapshots).length === 0, "fixture has authoritative complete snapshots")

    const rowCount = await prisma.weekLineup.count({ where: { season: league.currentSeason, week: historicalWeek } })
    await expect(freezeWeekLineup(prisma, league.id, league.currentSeason, historicalWeek)).rejects.toThrow(/Only the current fantasy week/)
    expect(await scoringSlotsForWeek(league.id, league.currentSeason, historicalWeek, participants)).toBeNull()
    expect(await updateWeeklyMatchupScores(league.id, historicalWeek)).toBe(0)

    const after = await prisma.matchup.findMany({
      where: { leagueId: league.id, season: league.currentSeason, week: historicalWeek },
      orderBy: { id: "asc" },
      select: { id: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, homePoints: true, awayPoints: true, isFinal: true },
    })
    expect(after).toEqual(before)
    expect(await prisma.weekLineup.count({ where: { season: league.currentSeason, week: historicalWeek } })).toBe(rowCount)

    const preview = await weekLineupForLeague(league.id, league.currentSeason, historicalWeek)
    expect(preview.source).toBe("unavailable")
    expect(preview.locked).toBe(true)
    expect(preview.assignments).toEqual([])
  })

  test("a move for another manager's team is refused", async ({ request }) => {
    const other = await prisma.team.findFirstOrThrow({ where: { name: { not: "Montreal Monarchs" } } })
    const slot = await prisma.rosterSlot.findFirstOrThrow({ where: { teamId: other.id } })
    const response = await request.post("/api/roster/move", { data: { teamId: other.id, playerId: slot.playerId, targetSlot: "BN" } })
    expect([400, 401, 403]).toContain(response.status())
    const after = await prisma.rosterSlot.findUniqueOrThrow({ where: { id: slot.id } })
    expect(after.slot).toBe(slot.slot)
  })
})

test.describe("week sync in the UI", () => {
  test("the league tab opens on the real NHL week (week 3 on Oct 12)", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "LEAGUE", exact: true }).click()
    await expect(page.getByText(`Week ${getCurrentFantasyWeek(2026)}`).first()).toBeVisible()
  })

  test("previous weeks show their final scores from the database", async ({ page }) => {
    const matchup = await prisma.matchup.findFirstOrThrow({ where: { week: 2, season: 2026 }, include: { homeTeam: true, awayTeam: true } })
    const stepsBack = Math.max(0, getCurrentFantasyWeek(2026) - 2)
    await page.goto("/")
    await page.getByRole("button", { name: "LEAGUE", exact: true }).click()
    for (let step = 0; step < stepsBack; step += 1) {
      await page.getByRole("button", { name: "Previous league week" }).click()
    }
    await expect(page.getByText("Week 2").first()).toBeVisible()
    await expect(page.getByText(Number(matchup.homeScore).toFixed(2)).first()).toBeVisible()
    await expect(page.getByText(Number(matchup.awayScore).toFixed(2)).first()).toBeVisible()
  })

  test("the team header record matches the standings computed from final matchups", async ({ page }) => {
    const team = await prisma.team.findFirstOrThrow({ where: { name: "Montreal Monarchs" } })
    const finals = await prisma.matchup.findMany({ where: { season: 2026, isFinal: true, OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }] } })
    let wins = 0, losses = 0
    for (const m of finals) {
      const home = m.homeTeamId === team.id
      const mine = Number(home ? m.homeScore : m.awayScore), theirs = Number(home ? m.awayScore : m.homeScore)
      if (mine > theirs) wins += 1
      else if (mine < theirs) losses += 1
    }
    await page.goto("/")
    await expect(page.getByText(`${wins}-${losses}`).first()).toBeVisible()
  })
})
