import { expect, test } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { getCurrentFantasyWeek, getFantasyWeekDates } from "../lib/season-calendar"

process.loadEnvFile?.(".env")
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
    await page.goto("/")
    await page.getByRole("button", { name: "LEAGUE", exact: true }).click()
    await page.getByRole("button", { name: "Previous league week" }).click()
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
