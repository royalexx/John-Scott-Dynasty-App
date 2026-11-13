import { expect, test, type Page, type TestInfo } from "@playwright/test"

const sizes = [
  { width: 320, height: 700 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]

const navigate = (page: Page, tab: string) =>
  page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: tab, exact: true })

async function capture(page: Page, info: TestInfo, name: string) {
  // Allow the existing motion/react SwipePager spring to reach its final tab.
  await page.waitForTimeout(600)
  const path = info.outputPath(`${name}.png`)
  await page.screenshot({ path, animations: "disabled", caret: "hide" })
  await info.attach(name, { path, contentType: "image/png" })
}

for (const { width, height } of sizes) {
  test(`Phase 4: Team has readable sections and NHL portraits at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height })
    await page.goto("/")
    await navigate(page, "TEAM").click()
    await expect(page.getByTestId("team-identity")).toBeVisible()
    await expect(page.getByTestId("team-stats")).toContainText("FAAB")
    await expect(page.getByTestId("team-score-labels")).toContainText("Actual")
    await expect(page.getByTestId("team-starters")).toBeVisible()
    const sections = ["team-bench", "team-ir", "team-taxi", "team-draft-picks"]
    for (const section of sections) await expect(page.getByTestId(section)).toHaveCount(1)

    const firstRow = page.getByTestId("team-player-row").first()
    await expect(firstRow).toBeAttached()
    await expect(firstRow.locator('[data-slot="player-portrait"] img')).toHaveAttribute("src", /\/api\/headshot|assets\.nhle\.com/)
    const slotTarget = firstRow.getByRole("button", { name: /Edit .* roster slot/ })
    const rect = await slotTarget.boundingBox()
    expect(rect?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(rect?.height ?? 0).toBeGreaterThanOrEqual(44)

    const metrics = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      shell: document.querySelector('[data-testid="app-shell"]')?.getBoundingClientRect().width ?? 0,
    }))
    expect(metrics.document).toBeLessThanOrEqual(metrics.viewport + 1)
    expect(metrics.shell).toBeLessThanOrEqual(431)
    await capture(page, info, `phase-04-team-${width}`)
  })

  test(`Phase 4: Match shows separate actual/projected scores and player portraits at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height })
    await page.goto("/")
    await navigate(page, "MATCH").click()
    const cards = page.getByTestId("matchup-scorecard")
    await expect(cards.first()).toBeAttached()
    await expect(cards.first()).toContainText("Projected points:")
    await expect(page.getByTestId("match-starters")).toBeAttached()
    await expect(page.getByTestId("match-reserves")).toBeAttached()
    await expect(page.getByText(/^\d+% WIN$/)).toHaveCount(0)
    const portraits = page.getByTestId("home-player").locator('[data-slot="player-portrait"] img')
    expect(await portraits.count()).toBeGreaterThan(0)
    await expect(portraits.first()).toHaveAttribute("src", /\/api\/headshot|assets\.nhle\.com/)
    const slot = page.getByTestId("match-starters").getByRole("button", { name: /Edit .* starting slot/ }).first()
    const box = await slot.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    const metrics = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }))
    expect(metrics.document).toBeLessThanOrEqual(metrics.viewport + 1)
    await capture(page, info, `phase-04-match-${width}`)
  })
}

test("Phase 4: Team actions and contextual trade navigation retain behavior", async ({ page }) => {
  await page.goto("/")
  await navigate(page, "TEAM").click()
  await expect(page.getByTestId("team-identity").getByRole("button", { name: "trade" })).toBeVisible()
  await page.getByTestId("team-identity").getByRole("button", { name: "trade" }).click()
  await expect(navigate(page, "PLAYERS")).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("button", { name: "Trade", exact: true })).toHaveAttribute("aria-pressed", "true")
  await navigate(page, "TEAM").click()
  await page.getByTestId("team-identity").getByRole("button", { name: "schedule" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
})

test("Phase 4: Team lineup warnings point to editable starters without saving data", async ({ page }) => {
  await page.goto("/")
  await navigate(page, "TEAM").click()
  const alertAction = page.getByRole("button", { name: "Review starters" })
  if (await alertAction.count()) {
    await alertAction.click()
    await expect(page.getByTestId("team-starters")).toBeVisible()
  }
  const row = page.getByTestId("team-player-row").first()
  const show = row.getByRole("button", { name: /View .* player details/ })
  await show.click()
  await expect(page.getByRole("dialog").first()).toBeVisible()
})
