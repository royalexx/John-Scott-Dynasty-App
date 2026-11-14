import { expect, test } from "@playwright/test"
import { MAX_FANTASY_WEEK } from "../lib/season-calendar"

const leagueTab = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "LEAGUE", exact: true })

for (const width of [320, 390]) {
  test("Phase 10: League week boundaries, 44px controls and no writes at " + width + "px", async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: width === 320 ? 700 : 844 })
    const writes: string[] = []
    page.on("request", (request) => {
      if (request.method() !== "GET" && /\\/api\\//.test(request.url())) writes.push(request.url())
    })
    await page.goto("/")
    await leagueTab(page).click()
    const feed = page.getByTestId("league-feed")
    const prev = feed.getByRole("button", { name: "Previous league week" })
    const next = feed.getByRole("button", { name: "Next league week" })
    const week = feed.locator('span[role="status"]').filter({ hasText: /^Week [0-9]+$/ }).first()
    for (const control of [prev, next]) {
      const rect = await control.boundingBox()
      expect(rect?.height ?? 0).toBeGreaterThanOrEqual(43.99)
      expect(rect?.width ?? 0).toBeGreaterThanOrEqual(43.99)
    }
    let current = Number((await week.innerText()).replace("Week ", ""))
    expect(current).toBeGreaterThanOrEqual(1)
    expect(current).toBeLessThanOrEqual(MAX_FANTASY_WEEK)
    while (current > 1) {
      await prev.click()
      current--
      await expect(week).toHaveText("Week " + current)
    }
    await expect(prev).toBeDisabled()
    while (current < MAX_FANTASY_WEEK) {
      await next.click()
      current++
      await expect(week).toHaveText("Week " + current)
    }
    await expect(next).toBeDisabled()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    expect(writes).toEqual([])
  })

  test("Phase 10: League manager filters are functional and reversible at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 844 })
    const writes: string[] = []
    page.on("request", (request) => {
      if (request.method() !== "GET" && /\\/api\\//.test(request.url())) writes.push(request.url())
    })
    await page.goto("/")
    await leagueTab(page).click()
    const activity = page.getByTestId("league-activity")
    await activity.getByRole("button", { name: "Filter activity" }).click()
    let sheet = page.getByRole("dialog").last()
    const checkboxes = sheet.getByRole("checkbox")
    const count = await checkboxes.count()
    expect(count).toBeGreaterThan(0)
    await expect(checkboxes.first()).toBeChecked()
    for (let index = 0; index < count; index++) await checkboxes.nth(index).uncheck()
    await sheet.getByRole("button", { name: "Show activity" }).click()
    await expect(activity.getByText("No league activity matches your filters.")).toBeVisible()
    await activity.getByRole("button", { name: "Filter activity" }).click()
    sheet = page.getByRole("dialog").last()
    await sheet.getByRole("button", { name: "Select all managers" }).click()
    await sheet.getByRole("button", { name: "Show activity" }).click()
    await expect(activity.getByText("No league activity matches your filters.")).toHaveCount(0)
    expect(writes).toEqual([])
  })
}
