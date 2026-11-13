import { expect, test, type Page, type TestInfo } from "@playwright/test"

const sizes = [
  { width: 320, height: 700 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]

const mainTab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name, exact: true })
const playerTab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Player market sections" }).getByRole("button", { name, exact: true })

async function capture(page: Page, info: TestInfo, name: string) {
  await page.waitForTimeout(550)
  const path = info.outputPath(`${name}.png`)
  await page.screenshot({ path, caret: "hide", animations: "disabled" })
  await info.attach(name, { path, contentType: "image/png" })
}

for (const viewport of sizes) {
  test(`Phase 5: compact Available player list retains NHL portraits at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await page.goto("/")
    await mainTab(page, "PLAYERS").click()
    await expect(playerTab(page, "Available")).toHaveAttribute("aria-pressed", "true")
    const list = page.getByTestId("available-player-list")
    const portraits = list.locator('[data-slot="player-portrait"] img')
    expect(await portraits.count()).toBeGreaterThan(0)
    await expect(portraits.first()).toHaveAttribute("src", /\/api\/headshot|assets\.nhle\.com/)
    await expect(page.getByText("Projected FPTS", { exact: true })).toBeVisible()
    const add = list.getByRole("button", { name: /Add or claim/ }).first()
    const bounds = await add.boundingBox()
    expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44)
    const measurements = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      shell: document.querySelector('[data-testid="app-shell"]')?.getBoundingClientRect().width ?? 0,
    }))
    expect(measurements.scrollWidth).toBeLessThanOrEqual(measurements.viewport + 1)
    expect(measurements.shell).toBeLessThanOrEqual(431)
    await capture(page, info, `phase-05-players-${viewport.width}`)
  })

  test(`Phase 5: League preserves compact sections and week navigation at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await page.goto("/")
    await mainTab(page, "LEAGUE").click()
    const feed = page.getByTestId("league-feed")
    await expect(feed).toBeVisible()
    await expect(page.getByTestId("league-weekly-podium")).toBeAttached()
    await expect(page.getByTestId("league-matchups")).toBeAttached()
    await expect(feed.getByRole("heading", { name: "Standings" })).toBeAttached()
    await expect(feed.getByRole("heading", { name: "Activity" })).toBeAttached()
    const next = feed.getByRole("button", { name: "Next league week" })
    const rect = await next.boundingBox()
    expect(rect?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect(rect?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(await feed.getByText("BID $5", { exact: true }).count()).toBe(0)
    const measurement = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }))
    expect(measurement.document).toBeLessThanOrEqual(measurement.viewport + 1)
    await capture(page, info, `phase-05-league-${viewport.width}`)
  })
}

test("Phase 5: Search and Leaders show portraits and support empty search feedback", async ({ page }, info) => {
  await page.goto("/")
  await mainTab(page, "PLAYERS").click()
  await playerTab(page, "Search").click()
  const search = page.getByRole("textbox", { name: "Search NHL players" })
  await expect(search).toBeVisible()
  const resultList = page.getByTestId("player-search-results")
  await expect(resultList.locator('[data-slot="player-portrait"] img').first()).toHaveAttribute("src", /\/api\/headshot|assets\.nhle\.com/)
  await capture(page, info, "phase-05-search-390")
  await search.fill("NONEXISTENT_PLAYER_ZZZ")
  await expect(page.getByText(/No players found matching/)).toBeVisible()
  await page.getByRole("button", { name: "Clear search" }).click()
  await expect(resultList.locator('[data-slot="player-portrait"] img').first()).toHaveAttribute("src", /\/api\/headshot|assets\.nhle\.com/)

  await playerTab(page, "Leaders").click()
  await expect(page.getByTestId("player-leaders-results").locator('[data-slot="player-portrait"] img').first()).toHaveAttribute("src", /\/api\/headshot|assets\.nhle\.com/)
  await capture(page, info, "phase-05-leaders-390")
})

test("Phase 5: Players filter and Trade tabs preserve existing actions", async ({ page }) => {
  await page.goto("/")
  await mainTab(page, "PLAYERS").click()
  await page.getByRole("button", { name: "Filters", exact: true }).click()
  await expect(page.getByTestId("position-filter-G")).toBeVisible()
  await page.getByTestId("position-filter-G").click()
  await page.getByTestId("position-filter-ALL").click()
  await page.keyboard.press("Escape")
  await playerTab(page, "Trade").click()
  await expect(playerTab(page, "Trade")).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("button", { name: "Open Trade Builder" })).toBeVisible()
})

test("Phase 5: legacy Phase 3 Match and Team structure is unchanged from before Phase 4", async ({ page }) => {
  await page.goto("/")
  await mainTab(page, "TEAM").click()
  await expect(page.getByTestId("team-identity")).toHaveCount(0)
  await expect(page.getByText(/^Starters \(/).first()).toBeAttached()
  await expect(page.locator('[data-slot="player-portrait"] img').first()).toHaveAttribute("src", /\/api\/headshot|assets\.nhle\.com/)
  await mainTab(page, "MATCH").click()
  await expect(page.getByTestId("matchup-scorecard")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Previous matchup" })).toBeAttached()
})
