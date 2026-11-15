import { expect, test } from "@playwright/test"
import { PlayerStatus, SlotType } from "@prisma/client"
import { previewFutureMove } from "../lib/services/future-lineup-plans"

test.describe("audit regressions", () => {
  test("players market: F/W/G filters and goalie sort controls", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "PLAYERS", exact: true }).click()
    await expect(page.getByRole("heading", { name: "Available", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Filters", exact: true }).click()

    // Skater sorts include SOG; goalie sorts must replace them with W / SV / SV% / GAA / SO.
    await expect(page.getByRole("button", { name: "SOG", exact: true })).toBeVisible()
    await page.getByTestId("position-filter-G").click()
    for (const sort of ["W", "SV", "SV%", "GAA", "SO"]) {
      await expect(page.getByRole("button", { name: sort, exact: true }).first()).toBeVisible()
    }
    await expect(page.getByRole("button", { name: "SOG", exact: true })).toHaveCount(0)

    await page.getByTestId("position-filter-F").click()
    await expect(page.getByRole("button", { name: "SOG", exact: true })).toBeVisible()
    await page.getByTestId("position-filter-W").click()
    await expect(page.getByRole("button", { name: "SOG", exact: true })).toBeVisible()
  })

  test("matchup: unplayed future weeks reset to 0.00 vs 0.00 and never show projections as actuals", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "MATCH", exact: true }).click()
    for (let step = 0; step < 4; step += 1) {
      await page.getByRole("button", { name: "Next scoring week" }).click()
    }
    await expect(page.locator("p.text-2xl")).toHaveText(["0.00", "0.00"])
    // Every starter's actual score is 0.0 (projection lives in its own "proj" line).
    const actualScores = page.locator("p.text-sm.font-bold.tabular-nums")
    const values = await actualScores.allTextContents()
    expect(values.length).toBeGreaterThan(0)
    for (const value of values) expect(["0.0", "—"]).toContain(value.trim())
  })

  test("matchup: clicking an opposing player opens their profile", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "MATCH", exact: true }).click()
    const awayPlayer = page.getByTestId("away-player").first()
    await expect(awayPlayer).toBeVisible()
    await awayPlayer.click()
    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("settings drawer exposes commissioner tools and the log out action", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "League & Team Settings" }).click()
    await expect(page.getByText("Commissioner Tools")).toBeVisible()
    await expect(page.getByRole("button", { name: "Switch Team / Log Out" })).toBeVisible()
  })

  test("team header shows the real record, and positions are not all C", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText("1-1 • 4th")).toHaveCount(0)
    await expect(page.getByText(/^\d+-\d+ • \d+(st|nd|rd|th)/)).toBeVisible()
    await expect(page.getByText(/LW - |RW - /).first()).toBeVisible()
  })

  test("rulebook: steppers mark settings dirty, discard restores, nothing is saved", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "League & Team Settings" }).click()
    await page.getByRole("button", { name: /Open Commissioner Rulebook/ }).click()
    const save = page.getByRole("button", { name: "Save Rulebook Settings" })
    await expect(save).toBeDisabled()
    await page.getByRole("button", { name: "Increase C" }).click()
    await expect(save).toBeEnabled()
    await expect(page.getByText("Unsaved")).toBeVisible()
    await page.getByRole("button", { name: "Discard" }).click()
    await expect(save).toBeDisabled()
    await page.getByRole("tab", { name: "Scoring" }).click()
    await expect(page.getByText("Goalies", { exact: true })).toBeVisible()
  })

  test("players market: available list is paginated with a Show more control", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "PLAYERS", exact: true }).click()
    await expect(page.getByText(/Showing 50 of \d+ players/)).toBeVisible()
    await expect(page.getByRole("button", { name: "Show 50 more" })).toBeVisible()
  })

  test("future plan: IR-for-IR swap safely displaces ineligible player to the bench and reverses", () => {
    // Deterministic, independent of live fixture injuries and current-week locks.
    // A center displaced from IR must never be assigned the goalie's vacated G slot.
    const makePlayer = (name: string, position: "C" | "G", status: PlayerStatus) =>
      ({ name, position, injuryStatus: status, nhlGamesPlayed: 30 })
    const limits = {
      rosterPositions: { C: 1, W: 0, F: 0, D: 0, G: 1, BN: 2 },
      rosterSize: 4, taxiSlots: 0, irSlots: 1, taxiMaxGames: 50,
    }
    const original = [
      { playerId: 1, slot: SlotType.IR, player: makePlayer("Injured center", "C", PlayerStatus.IR) },
      { playerId: 2, slot: SlotType.G, player: makePlayer("Injured goalie", "G", PlayerStatus.IR) },
      { playerId: 3, slot: SlotType.BN, player: makePlayer("Healthy center", "C", PlayerStatus.HEALTHY) },
    ]
    const swapped = previewFutureMove(original, limits, 2, SlotType.IR, 1)
    expect(swapped.find((entry) => entry.playerId === 2)?.slot).toBe(SlotType.IR)
    expect(swapped.find((entry) => entry.playerId === 1)?.slot).toBe(SlotType.BN)
    expect(original.find((entry) => entry.playerId === 1)?.slot).toBe(SlotType.IR)
    const goalieRestored = previewFutureMove(swapped, limits, 2, SlotType.G)
    const restored = previewFutureMove(goalieRestored, limits, 1, SlotType.IR)
    expect(restored.map((entry) => entry.slot)).toEqual(original.map((entry) => entry.slot))
  })

  test("roster move: healthy players cannot be placed on IR", async ({ request }) => {
    const session = await (await request.get("/api/auth/session")).json() as { user?: { teamId: string } }
    const response = await request.post("/api/roster/move", { data: { teamId: session.user!.teamId, playerId: 8479318, targetSlot: "IR" } })
    expect(response.status()).toBe(400)
  })})
